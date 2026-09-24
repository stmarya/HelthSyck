import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../api_client.dart';
import '../models/driver_order.dart';
import 'auth_provider.dart';

// ─────────────────────────────────────────────
// State driver
// ─────────────────────────────────────────────

class DriverOrderState {
  final List<DriverOrder> items;
  final DriverOrder? orderAktif;
  final bool isLoading;
  final String? error;
  final bool isOnline;
  final String? ambulanceId;  // Unit ambulans milik driver ini
  final String? platNomor;

  const DriverOrderState({
    this.items = const [],
    this.orderAktif,
    this.isLoading = false,
    this.error,
    this.isOnline = false,
    this.ambulanceId,
    this.platNomor,
  });

  DriverOrderState copyWith({
    List<DriverOrder>? items,
    DriverOrder? orderAktif,
    bool? isLoading,
    String? error,
    bool? isOnline,
    String? ambulanceId,
    String? platNomor,
  }) =>
      DriverOrderState(
        items: items ?? this.items,
        orderAktif: orderAktif ?? this.orderAktif,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        isOnline: isOnline ?? this.isOnline,
        ambulanceId: ambulanceId ?? this.ambulanceId,
        platNomor: platNomor ?? this.platNomor,
      );
}

// ─────────────────────────────────────────────
// Notifier driver — endpoint: ambulance-service :3005
// ─────────────────────────────────────────────
// Catatan: AMBULANCE_DRIVER dalam konteks mobile ini merujuk ke driver
// pengiriman obat (prescription_deliveries) BUKAN driver ambulans darurat.
// Namun backend menggunakan tabel ambulances untuk vehicle tracking.
// Di sini kita ambil prescription_deliveries sebagai "order" pengiriman.

class DriverOrderNotifier extends StateNotifier<DriverOrderState> {
  final ApiClient _api;
  final Logger _log;

  DriverOrderNotifier(this._api, this._log)
      : super(const DriverOrderState());

  /// [driverUserId] = userId dari auth state untuk lookup ambulans unit driver ini
  Future<void> fetchOrders({String? driverUserId}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // Ambil unit ambulans driver ini via lookup ambulance IDs dari DB
      // Driver hanya bisa akses GET /v1/ambulances/:id (per unit)
      String? ambulanceId = state.ambulanceId;
      String? platNomor = state.platNomor;
      bool isOnline = state.isOnline;

      if (ambulanceId == null && driverUserId != null) {
        // Coba cari unit berdasarkan userId menggunakan known ambulance IDs
        // (produksi: gunakan endpoint /v1/me/ambulance yang dedicated)
        final knownIds = [
          '00aa0000-0000-0000-0000-000000000001',
          '00aa0000-0000-0000-0000-000000000002',
          '00aa0000-0000-0000-0000-000000000003',
          '00aa0000-0000-0000-0000-000000000005',
          '00aa0000-0000-0000-0000-000000000006',
        ];
        for (final id in knownIds) {
          try {
            final resp = await _api.get('/v1/ambulances/$id', port: 3005);
            final data = resp['data'] as Map<String, dynamic>?;
            if (data != null && data['driver_id']?.toString() == driverUserId) {
              ambulanceId = id;
              platNomor = data['plate_number']?.toString();
              isOnline = data['status']?.toString() == 'AVAILABLE' ||
                  data['status']?.toString() == 'DISPATCHED';
              break;
            }
          } catch (_) {
            continue;
          }
        }
      }

      // Ambil prescription_deliveries sebagai order pengiriman
      final presResp = await _api.get('/v1/prescriptions', port: 3004);
      final presList = presResp['data'];
      List<DriverOrder> orders = [];

      if (presList is List) {
        orders = (presList as List)
            .where((e) {
              // Hanya resep yang butuh pengiriman (READY atau DELIVERED)
              final s = (e as Map<String, dynamic>)['status']?.toString() ?? '';
              return ['READY', 'DELIVERED', 'CONFIRMED', 'ISSUED'].contains(s);
            })
            .map((e) => _parseOrder(e as Map<String, dynamic>))
            .toList();
      }


      final aktif = orders
          .where((o) =>
              o.status != StatusOrder.selesai &&
              o.status != StatusOrder.dibatalkan)
          .firstOrNull;

      state = state.copyWith(
        items: orders,
        orderAktif: aktif,
        isLoading: false,
        isOnline: isOnline,
        ambulanceId: ambulanceId,
        platNomor: platNomor,
      );
    } catch (e) {
      _log.e('Fetch orders failed: $e');
      state = state.copyWith(
        items: const [],
        error: 'Data pengiriman tidak dapat dimuat.',
        isLoading: false,
      );
    }
  }

  Future<void> updateStatusOrder(String id, String status) async {
    try {
      // Map status order → endpoint prescription
      final endpoint = _statusToEndpoint(status);
      if (endpoint != null) {
        await _api.put('/v1/prescriptions/$id/$endpoint', port: 3004);
      }
      await fetchOrders();
    } on ApiException catch (e) {
      state = state.copyWith(error: e.detail);
    } catch (e) {
      // Update lokal tanpa generated copyWith
      final updated = state.items.map((o) {
        if (o.id != id) return o;
        return DriverOrder(
          id: o.id,
          pasienNama: o.pasienNama,
          pasienAlamat: o.pasienAlamat,
          apotek: o.apotek,
          status: status,
          items: o.items,
          createdAt: o.createdAt,
          jarakKm: o.jarakKm,
          estimasiMenit: o.estimasiMenit,
          catatanAlamat: o.catatanAlamat,
          latTujuan: o.latTujuan,
          lngTujuan: o.lngTujuan,
          latApotek: o.latApotek,
          lngApotek: o.lngApotek,
          waktuDiambil: o.waktuDiambil,
          waktuTiba: o.waktuTiba,
          ongkir: o.ongkir,
        );
      }).toList();
      state = state.copyWith(items: updated);
    }
  }

  /// Toggle online/offline status unit ambulans
  Future<void> toggleOnline(bool value) async {
    state = state.copyWith(isOnline: value);
    if (state.ambulanceId != null) {
      try {
        final newStatus = value ? 'AVAILABLE' : 'OFFLINE';
        await _api.put(
          '/v1/ambulances/${state.ambulanceId}/status',
          body: {'status': newStatus},
          port: 3005,
        );
      } catch (e) {
        _log.w('Toggle online: $e');
      }
    }
  }

  String? _statusToEndpoint(String status) {
    switch (status) {
      case StatusOrder.diambil:  return 'prepare';
      case StatusOrder.diantar:  return 'deliver';
      case StatusOrder.selesai:  return 'complete';
      default:                   return null;
    }
  }

  DriverOrder _parseOrder(Map<String, dynamic> json) {
    final prescId = json['id']?.toString() ?? '';
    final status = _mapPrescStatus(json['status']?.toString() ?? 'ISSUED');
    return DriverOrder(
      id: prescId,
      pasienNama: 'Pasien #${json['patient_id']?.toString().substring(0, 8) ?? '?'}',
      pasienAlamat: json['delivery_address']?.toString() ?? 'Alamat pengiriman',
      apotek: 'Apotek HealthSync',
      status: status,
      items: [json['notes']?.toString() ?? 'Lihat di resep'],
      createdAt: json['issued_at'] != null
          ? DateTime.tryParse(json['issued_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  String _mapPrescStatus(String s) {
    switch (s.toUpperCase()) {
      case 'ISSUED':     return StatusOrder.menunggu;
      case 'CONFIRMED':  return StatusOrder.diterima;
      case 'PREPARED':   return StatusOrder.diambil;
      case 'READY':      return StatusOrder.diantar;
      case 'DELIVERED':
      case 'COMPLETED':  return StatusOrder.selesai;
      case 'CANCELLED':  return StatusOrder.dibatalkan;
      default:           return StatusOrder.menunggu;
    }
  }


}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final driverOrderProvider =
    StateNotifierProvider<DriverOrderNotifier, DriverOrderState>(
  (ref) => DriverOrderNotifier(
    ref.watch(apiClientProvider),
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

final driverStatProvider = Provider<Map<String, int>>((ref) {
  final s = ref.watch(driverOrderProvider);
  return {
    'total':   s.items.length,
    'aktif':   s.items.where((o) =>
      o.status != StatusOrder.selesai && o.status != StatusOrder.dibatalkan
    ).length,
    'selesai': s.items.where((o) => o.status == StatusOrder.selesai).length,
  };
});
