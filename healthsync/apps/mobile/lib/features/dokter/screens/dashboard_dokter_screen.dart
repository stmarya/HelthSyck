import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';

class DashboardDokterScreen extends ConsumerStatefulWidget {
  const DashboardDokterScreen({super.key});

  @override
  ConsumerState<DashboardDokterScreen> createState() => _DashboardDokterScreenState();
}

class _DashboardDokterScreenState extends ConsumerState<DashboardDokterScreen> {
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _queue = const [];
  List<Map<String, dynamic>> _accepted = const [];
  List<Map<String, dynamic>> _active = const [];
  bool _loading = true;
  String? _error;
  bool _showProfileDetails = false;

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final responses = await Future.wait([
        _api.get('/v1/doctors/me', port: 3007),
        _api.get('/v1/consultations?status=PENDING&limit=20', port: 3003),
        _api.get('/v1/consultations?status=ACCEPTED&limit=20', port: 3003),
        _api.get('/v1/consultations?status=IN_PROGRESS&limit=20', port: 3003),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = responses[0]['data'] as Map<String, dynamic>?;
        _queue = _asMapList(responses[1]['data']);
        _accepted = _asMapList(responses[2]['data']);
        _active = _asMapList(responses[3]['data']);
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.detail;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat dashboard dokter.';
      });
    }
  }

  List<Map<String, dynamic>> _asMapList(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<void> _setAvailability(bool value) async {
    try {
      await _api.patch(
        '/v1/doctors/me/availability',
        port: 3007,
        body: {'isAvailable': value},
      );
      await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.detail), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile ?? const <String, dynamic>{};
    final doctorName = profile['name']?.toString()
        ?? profile['email']?.toString()
        ?? 'Dokter';
    final isAvailable = profile['is_available'] == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard Dokter'),
        actions: [
          IconButton(
            tooltip: 'Riwayat konsultasi',
            onPressed: () => context.push('/doctor/history'),
            icon: const Icon(Icons.history),
          ),
          IconButton(
            tooltip: 'Rujukan',
            onPressed: () => context.push('/doctor/referrals'),
            icon: const Icon(Icons.local_hospital_outlined),
          ),
          IconButton(
            tooltip: 'Notifikasi',
            onPressed: () => context.push('/doctor/notifications'),
            icon: const Icon(Icons.notifications_none),
          ),
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Card(
                      color: Colors.red.shade50,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(_error!, style: TextStyle(color: Colors.red.shade800)),
                      ),
                    ),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 28,
                            child: Text(doctorName.isEmpty ? 'D' : doctorName.substring(0, 1).toUpperCase()),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(doctorName, style: Theme.of(context).textTheme.titleMedium),
                                Text(
                                  _joinNonEmpty([
                                    profile['specialization'],
                                    profile['sub_specialization'],
                                  ], fallback: 'Profil dokter belum lengkap'),
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                Text(
                                  profile['hospital_name']?.toString() ?? 'Rumah sakit belum ditentukan',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                Text(
                                  '${profile['email'] ?? '-'} • ${profile['phone'] ?? '-'}',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                              ],
                            ),
                          ),
                          Column(
                            children: [
                              const Text('Tersedia', style: TextStyle(fontSize: 12)),
                              Switch(
                                value: isAvailable,
                                onChanged: _setAvailability,
                              ),
                            ],
                          ),
                        ],
                      ),
                      if (_showProfileDetails) ...[
                        const Divider(height: 24),
                        _ProfileDetails(profile: profile),
                      ],
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () => setState(() => _showProfileDetails = !_showProfileDetails),
                          icon: Icon(_showProfileDetails ? Icons.expand_less : Icons.expand_more),
                          label: Text(_showProfileDetails ? 'Sembunyikan profil lengkap' : 'Lihat profil lengkap'),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: _MetricCard(label: 'Menunggu', value: '${_queue.length}', icon: Icons.inbox_outlined)),
                      const SizedBox(width: 12),
                      Expanded(child: _MetricCard(label: 'Siap dimulai', value: '${_accepted.length}', icon: Icons.play_circle_outline)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _MetricCard(label: 'Aktif', value: '${_active.length}', icon: Icons.chat_bubble_outline)),
                      const SizedBox(width: 12),
                      Expanded(child: _MetricCard(label: 'Total berjalan', value: '${_accepted.length + _active.length}', icon: Icons.medical_services_outlined)),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Text('Antrian konsultasi', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  if (_queue.isEmpty)
                    const Card(child: ListTile(title: Text('Tidak ada konsultasi menunggu.')))
                  else
                    ..._queue.map((item) => _ConsultationTile(item: item)),
                  const SizedBox(height: 24),
                  Text('Siap dimulai', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  if (_accepted.isEmpty)
                    const Card(child: ListTile(title: Text('Tidak ada konsultasi yang siap dimulai.')))
                  else
                    ..._accepted.map((item) => _ConsultationTile(item: item)),
                  const SizedBox(height: 24),
                  Text('Konsultasi aktif', style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  if (_active.isEmpty)
                    const Card(child: ListTile(title: Text('Tidak ada konsultasi aktif.')))
                  else
                    ..._active.map((item) => _ConsultationTile(item: item)),
                ],
              ),
      ),
    );
  }
}

String _joinNonEmpty(List<dynamic> values, {required String fallback}) {
  final result = values
      .map((value) => value?.toString().trim() ?? '')
      .where((value) => value.isNotEmpty)
      .join(' • ');
  return result.isEmpty ? fallback : result;
}

class _ProfileDetails extends StatelessWidget {
  final Map<String, dynamic> profile;

  const _ProfileDetails({required this.profile});

  @override
  Widget build(BuildContext context) {
    final rating = profile['rating_avg']?.toString();
    final ratingCount = profile['rating_count']?.toString() ?? '0';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoRow(label: 'STR', value: _verificationValue(profile['str_number'], profile['str_verified_at'])),
        _InfoRow(label: 'SIP', value: _verificationValue(profile['sip_number'], profile['sip_verified_at'])),
        _InfoRow(label: 'Pengalaman', value: '${profile['years_experience'] ?? '-'} tahun'),
        _InfoRow(label: 'Biaya konsultasi', value: _formatCurrency(profile['consultation_fee'])),
        _InfoRow(label: 'Rating', value: rating == null ? 'Belum ada rating' : '$rating/5 ($ratingCount ulasan)'),
        _InfoRow(label: 'Status akun', value: profile['user_status']?.toString() ?? '-'),
        if ((profile['education']?.toString() ?? '').isNotEmpty)
          _InfoRow(label: 'Pendidikan', value: profile['education'].toString()),
        if ((profile['bio']?.toString() ?? '').isNotEmpty)
          _InfoRow(label: 'Bio', value: profile['bio'].toString()),
      ],
    );
  }

  String _verificationValue(dynamic number, dynamic verifiedAt) {
    final value = number?.toString() ?? '-';
    final verification = verifiedAt == null ? 'Belum terverifikasi' : 'Terverifikasi';
    return '$value • $verification';
  }

  String _formatCurrency(dynamic value) {
    if (value == null || value.toString().isEmpty) return 'Tidak ditentukan';
    return 'Rp ${value.toString()}';
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RichText(
        text: TextSpan(
          style: DefaultTextStyle.of(context).style,
          children: [
            TextSpan(text: '$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
            TextSpan(text: value),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _MetricCard({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: Theme.of(context).textTheme.headlineSmall),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsultationTile extends StatelessWidget {
  final Map<String, dynamic> item;

  const _ConsultationTile({required this.item});

  @override
  Widget build(BuildContext context) {
    final id = item['id']?.toString() ?? '';
    final patient = item['patient_name']?.toString() ?? 'Pasien';
    final complaint = item['chief_complaint']?.toString() ?? 'Keluhan belum tersedia';
    final status = item['status']?.toString() ?? '-';
    final urgency = item['urgency']?.toString() ?? 'NORMAL';
    final createdAt = item['created_at']?.toString() ?? '-';

    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(patient),
        subtitle: Text(
          '$status • Prioritas $urgency\n$complaint\nDibuat: $createdAt',
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: id.isEmpty ? null : () => context.go('/doctor/consultations/$id'),
      ),
    );
  }
}