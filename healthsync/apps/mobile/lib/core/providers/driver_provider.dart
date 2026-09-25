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
// Catatan: PHARMACY_DRIVER dalam konteks mobile ini merujuk ke driver
// pengiriman obat (prescription_deliveries), bukan driver ambulans darurat.
// Namun backend menggunakan tabel ambulances untuk vehicle tracking.
// Di sini kita ambil prescription_deliveries sebagai "order" pengiriman.

class DriverOrderNotifier extends StateNotifier<DriverOrderState> {
  final ApiClient _api;
  final Logger _log;

  DriverOrderNotifier(this._api, this._log)
      : super(const DriverOrderState());

  Future<void> fetchOrders() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      String? ambulanceId = state.ambulanceId;
      String? platNomor = state.platNomor;
      bool isOnline = state.isOnline;
      // Driver apotek tidak melakukan polling lima unit ambulans. Status
      // online untuk delivery saat ini bersifat lokal sampai endpoint driver
      // presence khusus ditambahkan.

      // Ambil delivery yang benar-benar ditugaskan ke driver ini.
      // Endpoint ini mencegah driver melihat resep milik driver lain.
      final deliveryResp = await _api.get('/v1/deliveries/me', port: 3004);
      final deliveryList = deliveryResp['data'];
      List<DriverOrder> orders = [];

      if (deliveryList is List) {
        orders = (deliveryList as List)
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
      _log.w('Fetch orders gagal: $e');
      state = state.copyWith(
        items: const [],
        orderAktif: null,
        isLoading: false,
        error: 'Gagal memuat delivery dari server',
      );
    }
  }

  Future<void> updateStatusOrder(String id, String status) async {
    try {
      if (status == StatusOrder.selesai) {
        await _api.put('/v1/prescriptions/$id/complete', port: 3004);
      } else {
        final deliveryStatus = _deliveryStatus(status);
        if (deliveryStatus != null) {
          await _api.put(
            '/v1/prescriptions/$id/delivery-status',
            body: {'status': deliveryStatus},
            port: 3004,
          );
        }
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

  String? _deliveryStatus(String status) {
    switch (status) {
      case StatusOrder.diambil:  return 'PICKED_UP';
      case StatusOrder.diantar:  return 'IN_TRANSIT';
      default:                   return null;
    }
  }

  DriverOrder _parseOrder(Map<String, dynamic> json) {
    final prescId = json['prescription_id']?.toString() ?? json['id']?.toString() ?? '';
    final status = _mapDeliveryStatus(json['status']?.toString() ?? 'ASSIGNED');
    return DriverOrder(
      id: prescId,
      pasienNama: json['patient_name']?.toString() ?? 'Pasien',
      pasienAlamat: json['delivery_address']?.toString() ?? 'Alamat pengiriman',
      apotek: 'Apotek HealthSync',
      status: status,
      items: [
        if (json['tracking_code'] != null)
          'Tracking: ${json['tracking_code']}',
      ],
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  String _mapDeliveryStatus(String s) {
    switch (s.toUpperCase()) {
      case 'ASSIGNED':   return StatusOrder.diterima;
      case 'PICKED_UP':  return StatusOrder.diambil;
      case 'IN_TRANSIT': return StatusOrder.diantar;
      case 'DELIVERED':  return StatusOrder.selesai;
      default:           return StatusOrder.diterima;
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
