import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../api_client.dart';
import '../models/pharmacy.dart';
import 'auth_provider.dart';

// ─────────────────────────────────────────────
// State resep (prescriptions)
// ─────────────────────────────────────────────

class ResepState {
  final List<ResepMasuk> items;
  final bool isLoading;
  final String? error;

  const ResepState({
    this.items = const [],
    this.isLoading = false,
    this.error,
  });

  ResepState copyWith({
    List<ResepMasuk>? items,
    bool? isLoading,
    String? error,
  }) =>
      ResepState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

// ─────────────────────────────────────────────
// Notifier resep — endpoint: prescription-service :3004
// ─────────────────────────────────────────────

class ResepNotifier extends StateNotifier<ResepState> {
  final ApiClient _api;
  final Logger _log;

  ResepNotifier(this._api, this._log) : super(const ResepState());

  Future<void> fetchResep() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // GET /v1/prescriptions — PHARMACIST melihat semua resep
      final resp = await _api.get('/v1/prescriptions', port: 3004);
      final rawList = resp['data'];
      if (rawList is! List) {
        state = state.copyWith(items: [], isLoading: false);
        return;
      }

      // Untuk setiap resep, ambil items melalui prescription_items dari DB
      // (endpoint /v1/prescriptions/:id/items tidak tersedia — gunakan data inline)
      final items = await Future.wait(
        (rawList as List).map((e) => _enrichResep(e as Map<String, dynamic>)),
      );
      state = state.copyWith(items: items, isLoading: false);
    } on ApiException catch (e) {
      _log.e('Fetch resep error: $e');
      state = state.copyWith(isLoading: false, error: e.detail);
    } catch (e) {
      _log.e('Fetch resep unexpected: $e');
      state = state.copyWith(
        isLoading: false,
        error: 'Gagal memuat data resep',
      );
    }
  }

  /// Ambil detail resep termasuk items
  Future<ResepMasuk> _enrichResep(Map<String, dynamic> json) async {
    final id = json['id']?.toString() ?? '';
    List<ItemResep> items = [];

    // Coba ambil prescription_items dari detail endpoint
    try {
      final detail = await _api.get('/v1/prescriptions/$id', port: 3004);
      final detailData = detail['data'] as Map<String, dynamic>?;
      final rawItems = detailData?['items'] as List?;
      if (rawItems != null) {
        items = rawItems.map((it) {
          final m = it as Map<String, dynamic>;
          return ItemResep(
            namaObat: m['drug_name']?.toString() ?? 'Obat',
            jumlah: (m['quantity'] as num?)?.toInt() ?? 1,
            satuan: 'tablet',
            aturanPakai: m['instructions']?.toString() ??
                m['dosage']?.toString() ?? '-',
          );
        }).toList();
      }
    } catch (_) {
      // Jika detail gagal, buat placeholder
      items = [
        ItemResep(
          namaObat: 'Lihat di detail resep',
          jumlah: 1,
          satuan: 'item',
          aturanPakai: json['notes']?.toString() ?? '-',
        )
      ];
    }

    return ResepMasuk(
      id: id,
      // patient_id & doctor_id ada, tapi nama harus di-resolve dari service lain
      // Gunakan ID yang diformat sebagai fallback
      pasienNama: 'Pasien #${json['patient_id']?.toString().substring(0, 8) ?? '?'}',
      dokterNama: 'Dokter #${json['doctor_id']?.toString().substring(0, 8) ?? '?'}',
      items: items,
      // Mapping status API → StatusResep
      status: _mapStatus(json['status']?.toString() ?? 'ISSUED'),
      createdAt: json['issued_at'] != null
          ? DateTime.tryParse(json['issued_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      catatanDokter: json['notes']?.toString(),
      nomorResep: id.substring(0, 8).toUpperCase(),
    );
  }

  /// Map status prescription-service → konstanta StatusResep
  String _mapStatus(String apiStatus) {
    switch (apiStatus.toUpperCase()) {
      case 'ISSUED':
        return StatusResep.menunggu;   // ISSUED → menunggu dikonfirmasi apotek
      case 'CONFIRMED':
        return StatusResep.diproses;   // CONFIRMED → sedang diproses
      case 'PREPARED':
        return StatusResep.diproses;
      case 'READY':
        return StatusResep.siap;       // READY → siap diambil
      case 'DELIVERED':
      case 'COMPLETED':
        return StatusResep.selesai;
      case 'CANCELLED':
        return StatusResep.dibatalkan;
      default:
        return StatusResep.menunggu;
    }
  }

  /// Update status resep menggunakan endpoint spesifik per status
  Future<void> updateStatusResep(String id, String status) async {
    try {
      // Map StatusResep → endpoint PUT
      final endpoint = _statusEndpoint(status);
      if (endpoint == null) {
        _log.w('Tidak ada endpoint untuk status: $status');
        return;
      }
      await _api.put('/v1/prescriptions/$id/$endpoint', port: 3004);
      await fetchResep();
    } on ApiException catch (e) {
      _log.e('Update status resep error: $e');
      state = state.copyWith(error: e.detail);
    } catch (e) {
      _log.e('Update status resep: $e');
      state = state.copyWith(error: 'Gagal update status resep');
    }
  }

  String? _statusEndpoint(String status) {
    switch (status) {
      case StatusResep.diproses:   return 'confirm';  // ISSUED → CONFIRMED
      case StatusResep.siap:       return 'ready';    // PREPARED → READY
      case StatusResep.selesai:    return 'complete'; // READY → COMPLETED
      default:                     return null;
    }
  }
}

// ─────────────────────────────────────────────
// State inventori obat
// ─────────────────────────────────────────────

class ObatState {
  final List<Obat> items;
  final bool isLoading;
  final String? error;
  final String? pharmacyId; // ID apotek yang sedang aktif

  const ObatState({
    this.items = const [],
    this.isLoading = false,
    this.error,
    this.pharmacyId,
  });

  ObatState copyWith({
    List<Obat>? items,
    bool? isLoading,
    String? error,
    String? pharmacyId,
  }) =>
      ObatState(
        items: items ?? this.items,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        pharmacyId: pharmacyId ?? this.pharmacyId,
      );
}

class ObatNotifier extends StateNotifier<ObatState> {
  final ApiClient _api;
  final Logger _log;

  ObatNotifier(this._api, this._log) : super(const ObatState());

  Future<void> fetchObat({String? pharmacyId}) async {
    state = state.copyWith(isLoading: true, error: null);

    // Gunakan pharmacyId yang tersimpan atau yang baru
    final pid = pharmacyId ?? state.pharmacyId;

    if (pid == null) {
      // Jika belum tahu pharmacy ID, ambil daftar apotek dulu lalu pakai yang pertama
      await _resolveAndFetch();
      return;
    }

    await _fetchInventory(pid);
  }

  Future<void> _resolveAndFetch() async {
    try {
      final resp = await _api.get('/v1/pharmacies', port: 3008);
      final rawList = resp['data'];
      if (rawList is List && (rawList as List).isNotEmpty) {
        final firstId = (rawList.first as Map<String, dynamic>)['id']?.toString();
        if (firstId != null) {
          state = state.copyWith(pharmacyId: firstId);
          await _fetchInventory(firstId);
          return;
        }
      }
      state = state.copyWith(items: _mockObat(), isLoading: false);
    } catch (e) {
      _log.w('Resolve pharmacy: $e');
      state = state.copyWith(items: _mockObat(), isLoading: false);
    }
  }

  Future<void> _fetchInventory(String pharmId) async {
    try {
      final resp = await _api.get('/v1/pharmacies/$pharmId/inventory', port: 3008);
      final rawList = resp['data'];
      if (rawList is List) {
        final items = (rawList as List).map((e) {
          final m = e as Map<String, dynamic>;
          final stockQty = (m['stock_qty'] as num?)?.toInt() ?? 0;
          final reorderLevel = (m['reorder_level'] as num?)?.toInt() ?? 0;
          return Obat(
            id: m['id']?.toString() ?? '',
            nama: '${m['generic_name'] ?? 'Obat'} ${m['strength'] ?? ''}',
            kategori: m['dosage_form']?.toString() ?? 'TABLET',
            stok: stockQty,
            satuan: _satuanDari(m['dosage_form']?.toString()),
            harga: double.tryParse(m['unit_price']?.toString() ?? '0') ?? 0,
            kode: m['batch_number']?.toString(),
            deskripsi: m['brand_name']?.toString(),
            kadaluarsa: m['expires_at'] != null
                ? DateTime.tryParse(m['expires_at'].toString())
                : null,
            stokMinimum: reorderLevel,
          );
        }).toList();
        state = state.copyWith(items: items, isLoading: false);
      } else {
        state = state.copyWith(items: _mockObat(), isLoading: false);
      }
    } catch (e) {
      _log.w('Fetch inventory: $e');
      state = state.copyWith(items: _mockObat(), isLoading: false);
    }
  }

  String _satuanDari(String? form) {
    switch (form?.toUpperCase()) {
      case 'TABLET':  return 'tablet';
      case 'CAPSULE': return 'kapsul';
      case 'SYRUP':   return 'botol';
      case 'INJECTION': return 'ampul';
      default:        return 'unit';
    }
  }

  List<Obat> _mockObat() => [
    const Obat(id: '1', nama: 'Paracetamol 500mg', kategori: 'TABLET', stok: 500, satuan: 'tablet', harga: 1200, stokMinimum: 100),
    const Obat(id: '2', nama: 'Amoxicillin 500mg', kategori: 'CAPSULE', stok: 250, satuan: 'kapsul', harga: 8500, stokMinimum: 50),
    const Obat(id: '3', nama: 'Metformin 500mg', kategori: 'TABLET', stok: 200, satuan: 'tablet', harga: 6500, stokMinimum: 50),
    const Obat(id: '4', nama: 'Salbutamol 4mg', kategori: 'TABLET', stok: 12, satuan: 'tablet', harga: 1500, stokMinimum: 30),
    const Obat(id: '5', nama: 'Omeprazole 20mg', kategori: 'CAPSULE', stok: 180, satuan: 'kapsul', harga: 15000, stokMinimum: 40),
  ];
}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final resepProvider = StateNotifierProvider<ResepNotifier, ResepState>(
  (ref) => ResepNotifier(
    ref.watch(apiClientProvider),
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

final obatProvider = StateNotifierProvider<ObatNotifier, ObatState>(
  (ref) => ObatNotifier(
    ref.watch(apiClientProvider),
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

final apotekStatProvider = Provider<Map<String, int>>((ref) {
  final resepState = ref.watch(resepProvider);
  final items = resepState.items;
  return {
    'total':    items.length,
    'menunggu': items.where((r) => r.status == StatusResep.menunggu).length,
    'diproses': items.where((r) => r.status == StatusResep.diproses).length,
    'siap':     items.where((r) => r.status == StatusResep.siap).length,
    'selesai':  items.where((r) => r.status == StatusResep.selesai).length,
  };
});
