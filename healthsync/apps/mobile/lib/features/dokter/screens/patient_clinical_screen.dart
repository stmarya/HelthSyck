import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';

class PatientClinicalScreen extends ConsumerStatefulWidget {
  final String patientId;

  const PatientClinicalScreen({super.key, required this.patientId});

  @override
  ConsumerState<PatientClinicalScreen> createState() => _PatientClinicalScreenState();
}

class _PatientClinicalScreenState extends ConsumerState<PatientClinicalScreen> {
  Map<String, dynamic>? _patient;
  Map<String, dynamic>? _latestVitals;
  List<Map<String, dynamic>> _vitals = const [];
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
      final patientResponse = await _api.get(
        '/v1/patients/${widget.patientId}',
        port: 3002,
      );
      Map<String, dynamic>? latest;
      try {
        final response = await _api.get(
          '/v1/patients/${widget.patientId}/vitals/latest',
          port: 3002,
        );
        latest = response['data'] as Map<String, dynamic>?;
      } on ApiException catch (error) {
        if (error.statusCode != 404) rethrow;
      }

      List<Map<String, dynamic>> vitals = const [];
      try {
        final response = await _api.get(
          '/v1/patients/${widget.patientId}/vitals?limit=50'
          '&from=${Uri.encodeQueryComponent(DateTime.now().toUtc().subtract(const Duration(days: 30)).toIso8601String())}',
          port: 3002,
        );
        final raw = response['data'];
        if (raw is Map && raw['vitals'] is List) {
          vitals = _asMapList(raw['vitals']);
        }
      } on ApiException catch (error) {
        if (error.statusCode != 404) rethrow;
      }

      if (!mounted) return;
      setState(() {
        _patient = patientResponse['data'] as Map<String, dynamic>?;
        _latestVitals = latest;
        _vitals = vitals;
        _loading = false;
      });
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
        _error = 'Gagal memuat data klinis pasien.';
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

  @override
  Widget build(BuildContext context) {
    final patient = _patient ?? const <String, dynamic>{};
    final conditions = _asMapList(patient['conditions']);
    final allergies = _asMapList(patient['allergies']);

    return Scaffold(
      appBar: AppBar(
        title: Text(patient['name']?.toString() ?? 'Data klinis pasien'),
        actions: [
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    _ErrorCard(message: _error!),
                  _PatientSummary(patient: patient),
                  const SizedBox(height: 12),
                  const _SectionCard(
                    title: 'Privasi dan kelengkapan data',
                    icon: Icons.verified_user_outlined,
                    child: Text(
                      'NIK tidak ditampilkan di aplikasi dokter. Data di bawah berasal dari profil pasien, rekam tanda vital, dan perangkat yang terhubung.',
                    ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Tanda vital terakhir',
                    icon: Icons.monitor_heart_outlined,
                    child: _latestVitals == null
                        ? const Text('Belum ada data tanda vital.')
                        : _VitalsGrid(vitals: _latestVitals!),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Riwayat tanda vital',
                    icon: Icons.timeline,
                    child: _vitals.isEmpty
                        ? const Text('Belum ada riwayat tanda vital.')
                        : Column(
                            children: _vitals
                                .map((vital) => _VitalHistoryTile(vital: vital))
                                .toList(),
                          ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Kondisi medis aktif',
                    icon: Icons.medical_information_outlined,
                    child: conditions.isEmpty
                        ? const Text('Tidak ada kondisi medis aktif.')
                        : Column(
                            children: conditions
                                .map((condition) => ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(condition['description']?.toString() ?? '-'),
                                      subtitle: Text(
                                        _joinValues([
                                          condition['icd10_code'] == null
                                              ? 'Kode ICD belum tersedia'
                                              : 'ICD-10 ${condition['icd10_code']}',
                                          condition['diagnosed_at'] == null
                                              ? 'Tanggal diagnosis belum dicatat'
                                              : 'Diagnosis ${condition['diagnosed_at']}',
                                          condition['notes'],
                                        ]),
                                      ),
                                    ))
                                .toList(),
                          ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Alergi',
                    icon: Icons.warning_amber_outlined,
                    child: allergies.isEmpty
                        ? const Text('Tidak ada alergi yang tercatat.')
                        : Column(
                            children: allergies
                                .map((allergy) => ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(allergy['allergen']?.toString() ?? '-'),
                                      subtitle: Text(
                                        '${allergy['reaction'] ?? 'Reaksi belum dicatat'}'
                                        '${allergy['severity'] == null ? '' : ' • ${allergy['severity']}'}',
                                      ),
                                    ))
                                .toList(),
                          ),
                  ),
                  const SizedBox(height: 12),
                  _SectionCard(
                    title: 'Perangkat terhubung',
                    icon: Icons.devices_other,
                    child: _asMapList(patient['devices']).isEmpty
                        ? const Text('Tidak ada perangkat aktif.')
                        : Column(
                            children: _asMapList(patient['devices'])
                                .map((device) => ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(device['device_id']?.toString() ?? '-'),
                                      subtitle: Text(
                                        _joinValues([
                                          device['device_type'],
                                          device['firmware_version'] == null
                                              ? 'Firmware belum tercatat'
                                              : 'Firmware ${device['firmware_version']}',
                                          device['last_seen_at'] == null
                                              ? 'Belum pernah terlihat'
                                              : 'Terakhir aktif ${device['last_seen_at']}',
                                        ]),
                                      ),
                                    ))
                                .toList(),
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _PatientSummary extends StatelessWidget {
  final Map<String, dynamic> patient;

  const _PatientSummary({required this.patient});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              patient['name']?.toString() ?? 'Pasien',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text('Gender: ${patient['gender'] ?? '-'}'),
            Text('Tanggal lahir: ${patient['date_of_birth'] ?? '-'}'),
            Text('Golongan darah: ${patient['blood_type'] ?? '-'}'),
            Text('Telepon: ${patient['phone'] ?? patient['user_phone'] ?? '-'}'),
            Text('Email: ${patient['email'] ?? '-'}'),
            Text('Alamat: ${patient['address'] ?? '-'}'),
            Text(
              'Kontak darurat: ${patient['emergency_contact_name'] ?? '-'}'
              ' • ${patient['emergency_contact_phone'] ?? '-'}',
            ),
            Text('Profil diperbarui: ${patient['updated_at'] ?? '-'}'),
          ],
        ),
      ),
    );
  }
}

class _VitalsGrid extends StatelessWidget {
  final Map<String, dynamic> vitals;

  const _VitalsGrid({required this.vitals});

  @override
  Widget build(BuildContext context) {
    final entries = <String, String>{
      'Heart rate': '${vitals['heart_rate'] ?? '-'} bpm',
      'SpO₂': '${vitals['spo2'] ?? '-'}%',
      'Tekanan darah': '${vitals['systolic_bp'] ?? '-'}/${vitals['diastolic_bp'] ?? '-'}',
      'Suhu': '${vitals['temperature'] ?? '-'} °C',
      'Aktivitas': '${vitals['activity_level'] ?? '-'}',
      'Baterai': '${vitals['battery_level'] ?? '-'}%',
      'Sinyal': '${vitals['signal_strength'] ?? '-'} dBm',
      'Sumber': '${vitals['source'] ?? '-'}',
    };
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: entries.entries
          .map((entry) => SizedBox(
                width: 140,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.key, style: Theme.of(context).textTheme.bodySmall),
                    Text(entry.value, style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

class _VitalHistoryTile extends StatelessWidget {
  final Map<String, dynamic> vital;

  const _VitalHistoryTile({required this.vital});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.monitor_heart_outlined),
      title: Text(
        'HR ${vital['heart_rate'] ?? '-'} • SpO₂ ${vital['spo2'] ?? '-'}%',
      ),
      subtitle: Text(
        '${vital['systolic_bp'] ?? '-'}/${vital['diastolic_bp'] ?? '-'} mmHg'
        ' • Suhu ${vital['temperature'] ?? '-'} °C'
        ' • ${vital['source'] ?? '-'}'
        ' • ${vital['recorded_at'] ?? '-'}',
      ),
    );
  }
}

String _joinValues(Iterable<dynamic> values) => values
    .map((value) => value?.toString().trim() ?? '')
    .where((value) => value.isNotEmpty)
    .join(' • ');

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 8),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
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