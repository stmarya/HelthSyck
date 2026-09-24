import 'package:freezed_annotation/freezed_annotation.dart';

part 'consultation.freezed.dart';
part 'consultation.g.dart';

@freezed
class Consultation with _$Consultation {
  const factory Consultation({
    required String id,
    required String patientId,
    required String doctorId,
    required String status, // scheduled|in_progress|completed|cancelled
    required String type, // telemedicine|in_person
    String? chiefComplaint,
    String? notes,
    String? diagnosis,
    String? doctorName,
    String? specialization,
    DateTime? scheduledAt,
    DateTime? startedAt,
    DateTime? endedAt,
    DateTime? createdAt,
  }) = _Consultation;

  factory Consultation.fromJson(Map<String, dynamic> json) =>
      _$ConsultationFromJson(json);
}

@freezed
class ConsultationMessage with _$ConsultationMessage {
  const factory ConsultationMessage({
    required String id,
    required String consultationId,
    required String senderId,
    required String senderRole,
    required String content,
    required String messageType, // TEXT|IMAGE|FILE
    required DateTime createdAt,
  }) = _ConsultationMessage;

  factory ConsultationMessage.fromJson(Map<String, dynamic> json) =>
      _$ConsultationMessageFromJson(json);
}
