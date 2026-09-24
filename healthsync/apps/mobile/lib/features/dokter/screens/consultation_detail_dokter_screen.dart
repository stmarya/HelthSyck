import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';

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
  bool _loading = true;
  bool _submitting = false;
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
    setState(() => _loading = true);
    try {
      final detail = await _api.get('/v1/consultations/${widget.consultationId}', port: 3003);
      final messages = await _api.get('/v1/consultations/${widget.consultationId}/messages', port: 3003);
      if (!mounted) return;
      setState(() {
        _consultation = detail['data'] as Map<String, dynamic>?;
        _messages = _asMapList(messages['data']);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.detail)));
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Gagal memuat konsultasi')),
      );
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
    if (submitted != true) return;

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
    _messageController.clear();
    try {
      await _api.post(
        '/v1/consultations/${widget.consultationId}/messages',
        port: 3003,
        body: {'content': text, 'messageType': 'TEXT'},
      );
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.detail)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final consultation = _consultation ?? const <String, dynamic>{};
    final status = consultation['status']?.toString() ?? '';
    final patient = consultation['patient_name']?.toString() ?? 'Pasien';

    return Scaffold(
      appBar: AppBar(title: Text('Konsultasi $patient')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Card(
                  margin: const EdgeInsets.all(16),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(consultation['chief_complaint']?.toString() ?? '-', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Text('Status: $status'),
                        if (consultation['diagnosis'] != null) Text('Diagnosis: ${consultation['diagnosis']}'),
                        const SizedBox(height: 12),
                        _actions(status),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return ListTile(
                        title: Text(message['content']?.toString() ?? ''),
                        subtitle: Text(message['sender_email']?.toString() ?? ''),
                      );
                    },
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(child: TextField(controller: _messageController, decoration: const InputDecoration(hintText: 'Tulis pesan...'))),
                        IconButton(onPressed: _submitting ? null : _sendMessage, icon: const Icon(Icons.send)),
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