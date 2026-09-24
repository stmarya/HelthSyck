import 'package:freezed_annotation/freezed_annotation.dart';

part 'ambulance_task.freezed.dart';
part 'ambulance_task.g.dart';

// ─────────────────────────────────────────────
// Model Tugas Ambulans
// ─────────────────────────────────────────────

@freezed
class AmbulanceTask with _$AmbulanceTask {
  const factory AmbulanceTask({
    required String id,
    required String pasienNama,
    required String alamatPasien,
    required String tujuanRS,
    required String status,
    required String prioritas,
    required DateTime createdAt,
    String? kondisiPasien,
    String? catatanMedis,
    double? latPasien,
    double? lngPasien,
    double? latRS,
    double? lngRS,
    double? jarakKm,
    DateTime? waktuBerangkat,
    DateTime? waktuTiba,
    String? perawatNama,
    String? sopirNama,
  }) = _AmbulanceTask;

  factory AmbulanceTask.fromJson(Map<String, dynamic> json) =>
      _$AmbulanceTaskFromJson(json);
}

// ─────────────────────────────────────────────
// Status & Prioritas Ambulans
// ─────────────────────────────────────────────

class StatusAmbulans {
  static const String standby    = 'STANDBY';
  static const String menuju     = 'EN_ROUTE_TO_PATIENT';
  static const String tiba       = 'ARRIVED_AT_PATIENT';
  static const String membawa    = 'TRANSPORTING';
  static const String selesai    = 'COMPLETED';
}

class PrioritasAmbulans {
  static const String normal  = 'NORMAL';
  static const String darurat = 'EMERGENCY';
  static const String kritis  = 'CRITICAL';
}
