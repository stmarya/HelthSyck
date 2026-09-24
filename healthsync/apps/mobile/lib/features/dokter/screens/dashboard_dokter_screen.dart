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
  List<Map<String, dynamic>> _active = const [];
  bool _loading = true;
  String? _error;

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
        _api.get('/v1/consultations?status=IN_PROGRESS&limit=20', port: 3003),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = responses[0]['data'] as Map<String, dynamic>?;
        _queue = _asMapList(responses[1]['data']);
        _active = _asMapList(responses[2]['data']);
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
                                  profile['specialization']?.toString() ?? 'Profil dokter belum lengkap',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                                Text(
                                  profile['hospital_name']?.toString() ?? 'Rumah sakit belum ditentukan',
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
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(child: _MetricCard(label: 'Menunggu', value: '${_queue.length}', icon: Icons.inbox_outlined)),
                      const SizedBox(width: 12),
                      Expanded(child: _MetricCard(label: 'Aktif', value: '${_active.length}', icon: Icons.chat_bubble_outline)),
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

    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.person_outline)),
        title: Text(patient),
        subtitle: Text('$status • $complaint', maxLines: 2, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right),
        onTap: id.isEmpty ? null : () => context.go('/doctor/consultations/$id'),
      ),
    );
  }
}