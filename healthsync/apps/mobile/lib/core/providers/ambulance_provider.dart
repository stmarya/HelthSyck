import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../api_client.dart';
import '../models/ambulance_task.dart';
import 'auth_provider.dart';

// ─────────────────────────────────────────────
// State ambulans
// ─────────────────────────────────────────────

class AmbulansState {
  final List<AmbulanceTask> tugasHistory;
  final AmbulanceTask? tugasAktif;
  final bool isLoading;
  final String? error;
  final String statusUnit;
  final String? ambulanceId;   // ID unit ambulans yang dikemudikan driver ini
  final String? platNomor;     // Plat nomor unit

  const AmbulansState({
    this.tugasHistory = const [],
    this.tugasAktif,
    this.isLoading = false,
    this.error,
    this.statusUnit = StatusAmbulans.standby,
    this.ambulanceId,
    this.platNomor,
  });

  AmbulansState copyWith({
    List<AmbulanceTask>? tugasHistory,
    AmbulanceTask? tugasAktif,
    bool? isLoading,
    String? error,
    String? statusUnit,
    String? ambulanceId,
    String? platNomor,
  }) =>
      AmbulansState(
        tugasHistory: tugasHistory ?? this.tugasHistory,
        tugasAktif: tugasAktif ?? this.tugasAktif,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        statusUnit: statusUnit ?? this.statusUnit,
        ambulanceId: ambulanceId ?? this.ambulanceId,
        platNomor: platNomor ?? this.platNomor,
      );
}

// ─────────────────────────────────────────────
// Notifier ambulans — endpoint: ambulance-service :3005
// ─────────────────────────────────────────────

class AmbulansNotifier extends StateNotifier<AmbulansState> {
  final ApiClient _api;
  final Logger _log;

  AmbulansNotifier(this._api, this._log) : super(const AmbulansState());

  /// Muat data ambulans milik driver yang sedang login
  /// [driverUserId] = user ID dari auth state untuk lookup ambulans
  Future<void> fetchTugas({String? driverUserId}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      Map<String, dynamic>? unitData;

      // Jika sudah tahu ambulanceId, langsung fetch by ID
      if (state.ambulanceId != null) {
        final resp = await _api.get('/v1/ambulances/${state.ambulanceId}', port: 3005);
        unitData = resp['data'] as Map<String, dynamic>?;
      } else if (driverUserId != null) {
        // Lookup unit ambulans berdasarkan driver_id
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
              unitData = data;
              break;
            }
          } catch (_) {
            continue;
          }
        }
      }

      if (unitData == null) {
        state = state.copyWith(
          tugasHistory: const [],
          error: 'Unit ambulans untuk akun ini belum ditemukan.',
          isLoading: false,
        );
        return;
      }

      final ambulanceId = unitData['id']?.toString() ?? '';
      final platNomor = unitData['plate_number']?.toString() ?? '';
      final statusRaw = unitData['status']?.toString() ?? 'OFFLINE';
      final statusUnit = _mapStatus(statusRaw);

      // Buat tugas aktif dari unit DISPATCHED
      AmbulanceTask? tugasAktif;
      if (statusRaw == 'DISPATCHED') {
        tugasAktif = AmbulanceTask(
          id: ambulanceId,
          pasienNama: 'Pasien Darurat',
          alamatPasien: 'Sedang dalam misi',
          tujuanRS: unitData['hospital_name']?.toString() ?? 'RS Tujuan',
          status: StatusAmbulans.membawa,
          prioritas: PrioritasAmbulans.darurat,
          createdAt: DateTime.now(),
          latPasien: double.tryParse(unitData['latitude']?.toString() ?? ''),
          lngPasien: double.tryParse(unitData['longitude']?.toString() ?? ''),
        );
      }

      // Ambil riwayat lokasi sebagai "history" sementara
      final history = tugasAktif != null ? [tugasAktif] : <AmbulanceTask>[];

      state = state.copyWith(
        tugasHistory: history,
        tugasAktif: tugasAktif,
        statusUnit: statusUnit,
        ambulanceId: ambulanceId,
        platNomor: platNomor,
        isLoading: false,
      );
    } on ApiException catch (e) {
      _log.e('Fetch tugas ambulans error: $e');
      state = state.copyWith(
        isLoading: false,
        error: e.detail,
        tugasHistory: const [],
      );
    } catch (e) {
      _log.e('Fetch tugas ambulans failed: $e');
      state = state.copyWith(
        isLoading: false,
        error: 'Data tugas ambulans tidak dapat dimuat.',
        tugasHistory: const [],
      );
    }
  }

  /// Update status unit ambulans via PUT /v1/ambulances/:id/status
  Future<void> updateStatusTugas(String id, String status) async {
    final ambulanceId = state.ambulanceId ?? id;
    try {
      // Map status tugas → status ambulans
      final unitStatus = _taskStatusToUnit(status);
      await _api.put(
        '/v1/ambulances/$ambulanceId/status',
        body: {'status': unitStatus},
        port: 3005,
      );
      await fetchTugas();
    } catch (e) {
      _log.w('Update status: $e — update lokal');
      // Update lokal tanpa generated copyWith
      final aktif = state.tugasAktif;
      if (aktif != null) {
        final updated = AmbulanceTask(
          id: aktif.id,
          pasienNama: aktif.pasienNama,
          alamatPasien: aktif.alamatPasien,
          tujuanRS: aktif.tujuanRS,
          status: status,
          prioritas: aktif.prioritas,
          createdAt: aktif.createdAt,
          kondisiPasien: aktif.kondisiPasien,
          catatanMedis: aktif.catatanMedis,
          latPasien: aktif.latPasien,
          lngPasien: aktif.lngPasien,
          latRS: aktif.latRS,
          lngRS: aktif.lngRS,
          jarakKm: aktif.jarakKm,
          waktuBerangkat: aktif.waktuBerangkat,
          waktuTiba: aktif.waktuTiba,
          perawatNama: aktif.perawatNama,
          sopirNama: aktif.sopirNama,
        );
        state = state.copyWith(
          tugasAktif: status == StatusAmbulans.selesai ? null : updated,
          statusUnit: status == StatusAmbulans.selesai
              ? StatusAmbulans.standby
              : state.statusUnit,
        );
      }
    }
  }

  /// Kirim update lokasi ambulans
  Future<void> kirimLokasi({
    required double lat,
    required double lng,
    double? heading,
    double? speedKmh,
  }) async {
    final ambulanceId = state.ambulanceId;
    if (ambulanceId == null) return;
    try {
      await _api.post(
        '/v1/ambulances/$ambulanceId/location',
        body: {
          'latitude': lat,
          'longitude': lng,
          if (heading != null) 'heading': heading,
          if (speedKmh != null) 'speed_kmh': speedKmh,
        },
        port: 3005,
      );
    } catch (e) {
      _log.w('Kirim lokasi: $e');
    }
  }

  String _mapStatus(String apiStatus) {
    switch (apiStatus.toUpperCase()) {
      case 'AVAILABLE': return StatusAmbulans.standby;
      case 'DISPATCHED': return 'BUSY';
      case 'OFFLINE': return 'OFFLINE';
      default: return StatusAmbulans.standby;
    }
  }

  String _taskStatusToUnit(String taskStatus) {
    switch (taskStatus) {
      case StatusAmbulans.menuju:   return 'DISPATCHED';
      case StatusAmbulans.selesai:  return 'AVAILABLE';
      default:                      return 'DISPATCHED';
    }
  }


}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final ambulansProvider =
    StateNotifierProvider<AmbulansNotifier, AmbulansState>(
  (ref) => AmbulansNotifier(
    ref.watch(apiClientProvider),
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

final ambulansStatProvider = Provider<Map<String, dynamic>>((ref) {
  final s = ref.watch(ambulansProvider);
  final history = s.tugasHistory;
  return {
    'total':          history.length,
    'selesai':        history.where((t) => t.status == StatusAmbulans.selesai).length,
    'statusUnit':     s.statusUnit,
    'adaTugasAktif':  s.tugasAktif != null,
    'platNomor':      s.platNomor ?? '-',
  };
});
