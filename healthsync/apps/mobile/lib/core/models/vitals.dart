import 'package:freezed_annotation/freezed_annotation.dart';

part 'vitals.freezed.dart';
part 'vitals.g.dart';

@freezed
class VitalsReading with _$VitalsReading {
  const factory VitalsReading({
    required String id,
    required String patientId,
    required String deviceId,
    required double heartRate,
    required double systolic,
    required double diastolic,
    required double spo2,
    required double temperature,
    required String alertLevel, // normal | level1 | level2 | critical
    required DateTime timestamp,
  }) = _VitalsReading;

  factory VitalsReading.fromJson(Map<String, dynamic> json) =>
      _$VitalsReadingFromJson(json);
}

@freezed
class VitalsAlert with _$VitalsAlert {
  const factory VitalsAlert({
    required String alertId,
    required String patientId,
    required String alertLevel,
    required String metric,
    required double value,
    required double threshold,
    required DateTime triggeredAt,
    bool? acknowledged,
  }) = _VitalsAlert;

  factory VitalsAlert.fromJson(Map<String, dynamic> json) =>
      _$VitalsAlertFromJson(json);
}
