import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';

class RujukanDokterScreen extends ConsumerStatefulWidget {
  final String? patientId;

  const RujukanDokterScreen({super.key, this.patientId});

  @override
  ConsumerState<RujukanDokterScreen> createState() => _RujukanDokterScreenState();
}

class _RujukanDokterScreenState extends ConsumerState<RujukanDokterScreen> {
  final _reasonController = TextEditingController();
  final _diagnosisController = TextEditingController();
  final _specializationController = TextEditingController();
  final _notesController = TextEditingController();
  List<Map<String, dynamic>> _referrals = const [];
  List<Map<String, dynamic>> _hospitals = const [];
  String _urgency = 'NORMAL';
  String? _hospitalId;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  ApiClient get _api => ref.read(apiClientProvider);
  bool get _isCreate => widget.patientId != null;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _diagnosisController.dispose();
    _specializationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_isCreate) {
        final response = await _api.get('/v1/hospitals?limit=100', port: 3007);
        final raw = response['data'];
        if (!mounted) return;
        setState(() {
          _hospitals = _asMapList(raw);
          _loading = false;
        });
      } else {
        final response = await _api.get('/v1/referrals?limit=50', port: 3006);
        final raw = response['data'];
        if (!mounted) return;
        setState(() {
          _referrals = _asMapList(raw);
          _loading = false;
        });
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.detail;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat data rujukan.';
      });
    }
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList();
  }

  Future<void> _submit() async {
    if (_hospitalId == null) {
      setState(() => _error = 'Pilih rumah sakit tujuan.');
      return;
    }
    if (_reasonController.text.trim().length < 20) {
      setState(() => _error = 'Alasan rujukan minimal 20 karakter.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final response = await _api.post(
        '/v1/referrals',
        port: 3006,
        body: {
          'patientId': widget.patientId,
          'toHospitalId': _hospitalId,
          'reason': _reasonController.text.trim(),
          'diagnosis': _diagnosisController.text.trim(),
          'urgencyLevel': _urgency,
          'requiredSpecialization': _specializationController.text.trim(),
          'notes': _notesController.text.trim(),
        },
      );
      final referralId = (response['data'] as Map?)?['id']?.toString();
      if (referralId != null && referralId.isNotEmpty) {
        await _api.put('/v1/referrals/$referralId/send', port: 3006);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Draft rujukan berhasil dibuat.')),
      );
      context.go('/doctor/referrals');
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = error.detail;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isCreate ? 'Buat rujukan' : 'Rujukan pasien'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _isCreate
              ? _buildForm()
              : _buildList(),
    );
  }

  Widget _buildForm() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_error != null) _ErrorCard(message: _error!),
        Text(
          'Pasien ${widget.patientId}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _hospitalId,
          decoration: const InputDecoration(labelText: 'Rumah sakit tujuan'),
          items: _hospitals
              .map(
                (hospital) => DropdownMenuItem(
                  value: hospital['id']?.toString(),
                  child: Text(
                    '${hospital['name'] ?? '-'} • ${hospital['city'] ?? '-'}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: (value) => setState(() => _hospitalId = value),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _urgency,
          decoration: const InputDecoration(labelText: 'Tingkat urgensi'),
          items: const [
            DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
            DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
            DropdownMenuItem(value: 'CRITICAL', child: Text('Critical')),
          ],
          onChanged: (value) => setState(() => _urgency = value ?? 'NORMAL'),
        ),
        TextField(
          controller: _reasonController,
          minLines: 3,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Alasan rujukan',
            hintText: 'Jelaskan kondisi dan alasan klinis rujukan',
          ),
        ),
        TextField(
          controller: _diagnosisController,
          decoration: const InputDecoration(labelText: 'Diagnosis sementara'),
        ),
        TextField(
          controller: _specializationController,
          decoration: const InputDecoration(labelText: 'Spesialisasi yang dibutuhkan'),
        ),
        TextField(
          controller: _notesController,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(labelText: 'Catatan tambahan'),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _submitting ? null : _submit,
          icon: _submitting
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.send),
          label: const Text('Buat dan kirim rujukan'),
        ),
      ],
    );
  }

  Widget _buildList() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) _ErrorCard(message: _error!),
          if (_referrals.isEmpty)
            const Card(child: ListTile(title: Text('Belum ada rujukan.')))
          else
            ..._referrals.map(
              (referral) => Card(
                child: ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.local_hospital_outlined)),
                  title: Text(referral['patient_name']?.toString() ?? 'Pasien'),
                  subtitle: Text(
                    '${referral['status'] ?? '-'} • ${referral['urgency_level'] ?? 'NORMAL'}\n'
                    '${referral['from_hospital_name'] ?? '-'} → ${referral['to_hospital_name'] ?? '-'}\n'
                    '${referral['reason'] ?? '-'}',
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: referral['id'] == null
                      ? null
                      : () => _showDetail(referral),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _showDetail(Map<String, dynamic> referral) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Detail rujukan'),
        content: SingleChildScrollView(
          child: Text(
            'Status: ${referral['status'] ?? '-'}\n'
            'Pasien: ${referral['patient_name'] ?? '-'}\n'
            'Tujuan: ${referral['to_hospital_name'] ?? '-'}\n'
            'Urgensi: ${referral['urgency_level'] ?? '-'}\n'
            'Diagnosis: ${referral['diagnosis'] ?? '-'}\n'
            'Spesialisasi: ${referral['required_specialization'] ?? '-'}\n'
            'Alasan: ${referral['reason'] ?? '-'}\n'
            'Catatan: ${referral['notes'] ?? '-'}\n'
            'Dibuat: ${referral['created_at'] ?? '-'}\n'
            'Dikirim: ${referral['sent_at'] ?? '-'}\n'
            'Diterima: ${referral['accepted_at'] ?? '-'}\n'
            'Tiba: ${referral['arrived_at'] ?? '-'}',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Tutup')),
        ],
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  final String message;

  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.red.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(message, style: TextStyle(color: Colors.red.shade800)),
      ),
    );
  }
}