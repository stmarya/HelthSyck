import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logger/logger.dart';

import '../models/consultation.dart';
import '../api_client.dart';
import 'auth_provider.dart';

// ─────────────────────────────────────────────
// Consultation list state
// ─────────────────────────────────────────────

class ConsultationsState {
  final List<Consultation> items;
  final bool loading;
  final String? error;
  final String? cursor; // for cursor pagination

  const ConsultationsState({
    this.items = const [],
    this.loading = false,
    this.error,
    this.cursor,
  });

  ConsultationsState copyWith({
    List<Consultation>? items,
    bool? loading,
    String? error,
    String? cursor,
  }) {
    return ConsultationsState(
      items: items ?? this.items,
      loading: loading ?? this.loading,
      error: error,
      cursor: cursor ?? this.cursor,
    );
  }
}

// ─────────────────────────────────────────────
// Consultation notifier
// ─────────────────────────────────────────────

class ConsultationNotifier extends StateNotifier<ConsultationsState> {
  final ApiClient _api;
  final Logger _log;

  ConsultationNotifier(this._api, this._log)
      : super(const ConsultationsState());

  // ── Fetch consultations ─────────────────────────

  Future<void> fetchConsultations({String? status}) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final path = status != null
          ? '/v1/consultations?status=$status&limit=20'
          : '/v1/consultations?limit=20';
      final response = await _api.get(path);

      final list = (response['data'] as List<dynamic>? ?? [])
          .map((e) => Consultation.fromJson(e as Map<String, dynamic>))
          .toList();
      final meta = response['meta'] as Map<String, dynamic>?;

      state = state.copyWith(
        items: list,
        loading: false,
        cursor: meta?['nextCursor'] as String?,
      );
    } on ApiException catch (e) {
      state = state.copyWith(loading: false, error: e.detail);
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  // ── Book a new consultation ─────────────────────

  Future<Consultation?> bookConsultation({
    required String doctorId,
    required String type,
    required String chiefComplaint,
    required DateTime scheduledAt,
  }) async {
    try {
      final response = await _api.post(
        '/v1/consultations',
        body: {
          'doctorId': doctorId,
          'type': type,
          'chiefComplaint': chiefComplaint,
          'scheduledAt': scheduledAt.toIso8601String(),
        },
      );
      final consultation = Consultation.fromJson(
        response['data'] as Map<String, dynamic>,
      );
      // Prepend to local list
      state = state.copyWith(items: [consultation, ...state.items]);
      _log.i('Booked consultation ${consultation.id}');
      return consultation;
    } on ApiException catch (e) {
      state = state.copyWith(error: e.detail);
      return null;
    }
  }

  // ── Cancel consultation ─────────────────────────

  Future<bool> cancelConsultation(String id) async {
    try {
      await _api.patch('/v1/consultations/$id/cancel', body: {});
      state = state.copyWith(
        items: state.items
            .map((c) => c.id == id ? c.copyWith(status: 'cancelled') : c)
            .toList(),
      );
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(error: e.detail);
      return false;
    }
  }

  // ── Fetch messages for a consultation ──────────────

  Future<List<ConsultationMessage>> fetchMessages(String consultationId) async {
    final response = await _api.get(
      '/v1/consultations/$consultationId/messages',
    );
    return (response['data'] as List<dynamic>? ?? [])
        .map((e) => ConsultationMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Send a message ──────────────────────────────

  Future<ConsultationMessage?> sendMessage({
    required String consultationId,
    required String content,
    String messageType = 'text',
  }) async {
    try {
      final response = await _api.post(
        '/v1/consultations/$consultationId/messages',
        body: {'content': content, 'messageType': messageType},
      );
      return ConsultationMessage.fromJson(
        response['data'] as Map<String, dynamic>,
      );
    } on ApiException catch (e) {
      _log.e('Send message failed: ${e.detail}');
      return null;
    }
  }
}

// ─────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────

final consultationProvider =
    StateNotifierProvider<ConsultationNotifier, ConsultationsState>(
  (ref) => ConsultationNotifier(
    ref.watch(apiClientProvider),
    Logger(printer: PrettyPrinter(methodCount: 0)),
  ),
);

/// Active (in_progress) consultation for telemedicine
final activeConsultationProvider = Provider<Consultation?>(
  (ref) => ref
      .watch(consultationProvider)
      .items
      .where((c) => c.status == 'in_progress')
      .firstOrNull,
);
