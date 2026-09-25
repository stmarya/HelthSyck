import 'package:freezed_annotation/freezed_annotation.dart';

part 'consultation.freezed.dart';
part 'consultation.g.dart';

@freezed
class Consultation with _$Consultation {
  const factory Consultation({
    required String id,
    @JsonKey(name: 'patient_id') required String patientId,
    @JsonKey(name: 'doctor_id') String? doctorId,
    required String status, // PENDING|ACCEPTED|IN_PROGRESS|COMPLETED|CANCELLED|EXPIRED
    @Default('telemedicine') String type,
    @JsonKey(name: 'chief_complaint') String? chiefComplaint,
    String? notes,
    String? diagnosis,
    String? doctorName,
    String? specialization,
    @JsonKey(name: 'symptom_data') Map<String, dynamic>? symptomData,
    @JsonKey(name: 'urgency') String? urgency,
    @JsonKey(name: 'started_at') DateTime? startedAt,
    @JsonKey(name: 'ended_at') DateTime? endedAt,
    @JsonKey(name: 'created_at') DateTime? createdAt,
  }) = _Consultation;

  factory Consultation.fromJson(Map<String, dynamic> json) =>
      _$ConsultationFromJson(json);
}

@freezed
class ConsultationMessage with _$ConsultationMessage {
  const factory ConsultationMessage({
    required String id,
    @JsonKey(name: 'consultation_id') required String consultationId,
    @JsonKey(name: 'sender_id') required String senderId,
    @JsonKey(name: 'sender_email') String? senderEmail,
    @Default('') String senderRole,
    required String content,
    @JsonKey(name: 'message_type') required String messageType, // TEXT|IMAGE|FILE|SYSTEM
    @JsonKey(name: 'created_at') required DateTime createdAt,
  }) = _ConsultationMessage;

  factory ConsultationMessage.fromJson(Map<String, dynamic> json) =>
      _$ConsultationMessageFromJson(json);
}
