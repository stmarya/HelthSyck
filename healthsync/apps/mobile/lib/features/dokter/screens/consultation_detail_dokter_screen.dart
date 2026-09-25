import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../widgets/doctor_ui.dart';

class ConsultationDetailDokterScreen extends ConsumerStatefulWidget {
  final String consultationId;

  const ConsultationDetailDokterScreen({super.key, required this.consultationId});

  @override
  ConsumerState<ConsultationDetailDokterScreen> createState() => _ConsultationDetailDokterScreenState();
}

class _ConsultationDetailDokterScreenState
    extends ConsumerState<ConsultationDetailDokterScreen> {
  Map<String, dynamic>? _consultation;
  List<Map<String, dynamic>> _messages = const [];
  List<Map<String, dynamic>> _prescriptions = const [];
  bool _loading = true;
  bool _submitting = false;
  String? _error;
  final _messageController = TextEditingController();

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await _api.get('/v1/consultations/${widget.consultationId}', port: 3003);
      final messages = await _api.get('/v1/consultations/${widget.consultationId}/messages', port: 3003);
      List<Map<String, dynamic>> prescriptions = const [];
      try {
        final response = await _api.get(
          '/v1/prescriptions?consultationId=${widget.consultationId}&limit=20',
          port: 3004,
        );
        final raw = response['data'];
        if (raw is List) {
          prescriptions = _asMapList(raw);
        }
      } on ApiException {
        // Prescription history is supplementary; consultation remains usable
        // when the pharmacy service is temporarily unavailable.
      }
      if (!mounted) return;
      setState(() {
        _consultation = detail['data'] as Map<String, dynamic>?;
        _messages = _asMapList(messages['data']);
        _prescriptions = prescriptions;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      setState(() => _error = e.detail);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat konsultasi.';
      });
    }
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }

  Future<void> _transition(String action) async {
    setState(() => _submitting = true);
    try {
      await _api.put('/v1/consultations/${widget.consultationId}/$action', port: 3003);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.detail)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _complete() async {
    final diagnosis = TextEditingController();
    final notes = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Selesaikan konsultasi'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: diagnosis, decoration: const InputDecoration(labelText: 'Diagnosis')),
            TextField(controller: notes, decoration: const InputDecoration(labelText: 'Catatan medis')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(context, diagnosis.text.trim().isNotEmpty),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );
    if (submitted != true) {
      diagnosis.dispose();
      notes.dispose();
      return;
    }

    setState(() => _submitting = true);
    try {
      await _api.put(
        '/v1/consultations/${widget.consultationId}/complete',
        port: 3003,
        body: {'diagnosis': diagnosis.text.trim(), 'notes': notes.text.trim()},
      );
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.detail)));
    } finally {
      diagnosis.dispose();
      notes.dispose();
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await _api.post(
        '/v1/consultations/${widget.consultationId}/messages',
        port: 3003,
        body: {'content': text, 'messageType': 'TEXT'},
      );
      _messageController.clear();
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.detail)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final consultation = _consultation ?? const <String, dynamic>{};
    final status = consultation['status']?.toString() ?? '';
    final patient = consultation['patient_name']?.toString() ?? 'Pasien';
    final patientId = consultation['patient_id']?.toString() ?? '';
    final symptomData = consultation['symptom_data'];

    return Scaffold(
      backgroundColor: DoctorUi.canvas,
      appBar: AppBar(
        backgroundColor: DoctorUi.canvas,
        title: Text(
          'Konsultasi $patient',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: _ErrorBanner(message: _error!, onRetry: _load),
                  ),
                DoctorSurface(
                  margin: const EdgeInsets.all(16),
                  child: Padding(
                    padding: EdgeInsets.zero,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                consultation['chief_complaint']?.toString() ?? '-',
                                style: const TextStyle(
                                  color: DoctorUi.ink,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                            DoctorStatusPill.fromStatus(status),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _InfoRow(label: 'Prioritas', value: consultation['urgency']?.toString() ?? 'NORMAL'),
                        _InfoRow(label: 'Dibuat', value: consultation['created_at']?.toString() ?? '-'),
                        _InfoRow(label: 'Dimulai', value: consultation['started_at']?.toString() ?? '-'),
                        _InfoRow(label: 'Selesai', value: consultation['ended_at']?.toString() ?? '-'),
                        _InfoRow(label: 'Diagnosis', value: consultation['diagnosis']?.toString() ?? 'Belum dicatat'),
                        _InfoRow(label: 'Catatan medis', value: consultation['notes']?.toString() ?? 'Belum dicatat'),
                        if (symptomData is Map && symptomData.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          const Text(
                            'Data gejala',
                            style: TextStyle(
                              color: DoctorUi.ink,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          ...symptomData.entries.map(
                            (entry) => _InfoRow(
                              label: entry.key.toString(),
                              value: entry.value?.toString() ?? '-',
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        _actions(status),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: patientId.isEmpty
                                  ? null
                                  : () => context.push('/doctor/patients/$patientId'),
                              icon: const Icon(Icons.medical_information_outlined),
                              label: const Text('Data klinis pasien'),
                            ),
                            if (patientId.isNotEmpty && (status == 'IN_PROGRESS' || status == 'COMPLETED'))
                              OutlinedButton.icon(
                                onPressed: () => context.push(
                                  '/doctor/prescriptions/new/${widget.consultationId}/$patientId',
                                ),
                                icon: const Icon(Icons.receipt_long),
                                label: const Text('Buat resep'),
                              ),
                            if (patientId.isNotEmpty && (status == 'IN_PROGRESS' || status == 'COMPLETED'))
                              OutlinedButton.icon(
                                onPressed: () => context.push('/doctor/referrals/new/$patientId'),
                                icon: const Icon(Icons.local_hospital_outlined),
                                label: const Text('Buat rujukan'),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (_prescriptions.isNotEmpty)
                  _PrescriptionSummaryList(items: _prescriptions),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Percakapan konsultasi',
                          style: TextStyle(
                            color: DoctorUi.ink,
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      DoctorStatusPill(
                        label: '${_messages.length} pesan',
                        color: DoctorUi.mutedInk,
                        icon: Icons.forum_outlined,
                      ),
                    ],
                  ),
                ),
                if (_messages.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: DoctorEmptyState(
                      title: 'Belum ada pesan',
                      message: 'Kirim pesan pertama untuk memulai percakapan.',
                      icon: Icons.chat_bubble_outline_rounded,
                    ),
                  ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      return _MessageBubble(message: _messages[index]);
                    },
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _submitting ? null : _sendMessage(),
                            decoration: InputDecoration(
                              hintText: 'Tulis catatan untuk pasien...',
                              prefixIcon: const Icon(Icons.chat_bubble_outline_rounded),
                              filled: true,
                              fillColor: Colors.white,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: const BorderSide(color: DoctorUi.border),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          tooltip: 'Kirim pesan',
                          onPressed: _submitting ? null : _sendMessage,
                          icon: const Icon(Icons.send_rounded),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _actions(String status) {
    if (status == 'PENDING') {
      return FilledButton.icon(
        onPressed: _submitting ? null : () => _transition('accept'),
        icon: const Icon(Icons.check),
        label: const Text('Terima konsultasi'),
      );
    }
    if (status == 'ACCEPTED') {
      return FilledButton.icon(
        onPressed: _submitting ? null : () => _transition('start'),
        icon: const Icon(Icons.play_arrow),
        label: const Text('Mulai konsultasi'),
      );
    }
    if (status == 'IN_PROGRESS') {
      return FilledButton.icon(
        onPressed: _submitting ? null : _complete,
        icon: const Icon(Icons.task_alt),
        label: const Text('Selesaikan'),
      );
    }
    return const SizedBox.shrink();
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(color: DoctorUi.mutedInk, fontSize: 13, height: 1.35),
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(color: DoctorUi.ink, fontWeight: FontWeight.w700),
            ),
            TextSpan(text: value),
          ],
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorBanner({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return DoctorSurface(
      color: const Color(0xFFFFF5F4),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: DoctorUi.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: DoctorUi.ink, fontSize: 13),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isSystem = message['message_type']?.toString() == 'SYSTEM';
    return Align(
      alignment: isSystem ? Alignment.center : Alignment.centerLeft,
      child: Container(
        width: isSystem ? double.infinity : null,
        constraints: const BoxConstraints(maxWidth: 420),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSystem ? DoctorUi.canvas : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: DoctorUi.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              message['content']?.toString() ?? '',
              style: const TextStyle(color: DoctorUi.ink, fontSize: 14, height: 1.35),
            ),
            const SizedBox(height: 6),
            Text(
              '${message['sender_email']?.toString() ?? '-'} • ${message['created_at']?.toString() ?? '-'}',
              style: const TextStyle(color: DoctorUi.mutedInk, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrescriptionSummaryList extends StatelessWidget {
  final List<Map<String, dynamic>> items;

  const _PrescriptionSummaryList({required this.items});

  @override
  Widget build(BuildContext context) {
    return DoctorSurface(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        leading: const Icon(Icons.receipt_long, color: DoctorUi.primary),
        title: Text(
          'Resep (${items.length})',
          style: const TextStyle(color: DoctorUi.ink, fontWeight: FontWeight.w800),
        ),
        children: items
            .map(
              (item) => ListTile(
                title: Text('Status: ${item['status'] ?? '-'}'),
                subtitle: Text(
                  'Diterbitkan: ${item['issued_at'] ?? '-'}\n'
                  'Berlaku sampai: ${item['expires_at'] ?? '-'}',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: item['id'] == null
                    ? null
                    : () => context.push('/doctor/prescriptions/${item['id']}'),
              ),
            )
            .toList(),
      ),
    );
  }
}