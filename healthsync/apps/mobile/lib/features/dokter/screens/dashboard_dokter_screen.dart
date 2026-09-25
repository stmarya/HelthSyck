import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api_client.dart';
import '../widgets/doctor_ui.dart';

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
  final _scrollController = ScrollController();
  final _queueSectionKey = GlobalKey();

  ApiClient get _api => ref.read(apiClientProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
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
        SnackBar(content: Text(e.detail), backgroundColor: DoctorUi.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _profile ?? const <String, dynamic>{};
    final doctorName = profile['name']?.toString() ??
        profile['email']?.toString() ??
        'Dokter';
    final isAvailable = profile['is_available'] == true;

    return Scaffold(
      backgroundColor: DoctorUi.canvas,
      appBar: AppBar(
        backgroundColor: DoctorUi.canvas,
        titleSpacing: 20,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Ruang kerja dokter',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
            ),
            Text(
              'Pantau pasien dan konsultasi hari ini',
              style: TextStyle(
                color: DoctorUi.mutedInk,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            onPressed: () => context.push('/doctor/notifications'),
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        color: DoctorUi.primary,
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: DoctorUi.primary))
            : ListView(
                controller: _scrollController,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  if (_error != null) ...[
                    _ErrorBanner(message: _error!, onRetry: _load),
                    const SizedBox(height: 16),
                  ],
                  _DoctorHero(
                    doctorName: doctorName,
                    profile: profile,
                    isAvailable: isAvailable,
                    showDetails: _showProfileDetails,
                    onAvailabilityChanged: _setAvailability,
                    onToggleDetails: () => setState(
                      () => _showProfileDetails = !_showProfileDetails,
                    ),
                  ),
                  if (_showProfileDetails) ...[
                    const SizedBox(height: 12),
                    DoctorSurface(child: _ProfileDetails(profile: profile)),
                  ],
                  const SizedBox(height: 20),
                  const DoctorSectionHeader(
                    title: 'Ringkasan hari ini',
                    subtitle: 'Status operasional dan beban konsultasi',
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DoctorMetricCard(
                          label: 'Menunggu',
                          value: '${_queue.length}',
                          icon: Icons.inbox_outlined,
                          color: DoctorUi.warning,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DoctorMetricCard(
                          label: 'Siap dimulai',
                          value: '${_accepted.length}',
                          icon: Icons.play_circle_outline_rounded,
                          color: DoctorUi.primary,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DoctorMetricCard(
                          label: 'Aktif',
                          value: '${_active.length}',
                          icon: Icons.forum_outlined,
                          color: DoctorUi.mint,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _PriorityCard(
                    waitingCount: _queue.length,
                    onOpenQueue: _showQueueHint,
                  ),
                  const SizedBox(height: 24),
                  const DoctorSectionHeader(
                    title: 'Akses cepat',
                    subtitle: 'Buka area kerja yang paling sering digunakan',
                  ),
                  const SizedBox(height: 12),
                  DoctorQuickAction(
                    label: 'Riwayat konsultasi',
                    caption: 'Lihat rekam layanan yang telah selesai',
                    icon: Icons.history_rounded,
                    onTap: () => context.push('/doctor/history'),
                  ),
                  const SizedBox(height: 8),
                  DoctorQuickAction(
                    label: 'Rujukan pasien',
                    caption: 'Kelola rujukan dan tindak lanjut',
                    icon: Icons.local_hospital_outlined,
                    onTap: () => context.push('/doctor/referrals'),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    key: _queueSectionKey,
                    child: DoctorSectionHeader(
                      title: 'Antrian konsultasi',
                      subtitle: _queue.isEmpty
                          ? 'Belum ada pasien yang menunggu'
                          : '${_queue.length} pasien membutuhkan perhatian',
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_queue.isEmpty)
                    const DoctorEmptyState(
                      title: 'Antrian sedang kosong',
                      message: 'Pasien baru akan muncul di sini secara otomatis.',
                    )
                  else
                    ..._queue.map((item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ConsultationTile(item: item),
                        )),
                  const SizedBox(height: 14),
                  const DoctorSectionHeader(
                    title: 'Siap dimulai',
                    subtitle: 'Konsultasi yang sudah Anda terima',
                  ),
                  const SizedBox(height: 12),
                  if (_accepted.isEmpty)
                    const DoctorEmptyState(
                      title: 'Belum ada konsultasi siap dimulai',
                      message: 'Terima konsultasi dari antrian untuk memulainya.',
                    )
                  else
                    ..._accepted.map((item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ConsultationTile(item: item),
                        )),
                  const SizedBox(height: 14),
                  const DoctorSectionHeader(
                    title: 'Konsultasi aktif',
                    subtitle: 'Percakapan yang sedang berlangsung',
                  ),
                  const SizedBox(height: 12),
                  if (_active.isEmpty)
                    const DoctorEmptyState(
                      title: 'Tidak ada konsultasi aktif',
                      message: 'Sesi yang sedang berjalan akan muncul di sini.',
                      icon: Icons.forum_outlined,
                    )
                  else
                    ..._active.map((item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _ConsultationTile(item: item),
                        )),
                ],
              ),
      ),
    );
  }

  void _showQueueHint() {
    final sectionContext = _queueSectionKey.currentContext;
    if (sectionContext == null) return;
    Scrollable.ensureVisible(
      sectionContext,
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      alignment: 0.08,
    );
  }
}

class _DoctorHero extends StatelessWidget {
  final String doctorName;
  final Map<String, dynamic> profile;
  final bool isAvailable;
  final bool showDetails;
  final ValueChanged<bool> onAvailabilityChanged;
  final VoidCallback onToggleDetails;

  const _DoctorHero({
    required this.doctorName,
    required this.profile,
    required this.isAvailable,
    required this.showDetails,
    required this.onAvailabilityChanged,
    required this.onToggleDetails,
  });

  @override
  Widget build(BuildContext context) {
    final initials = doctorName.trim().isEmpty ? 'D' : doctorName.trim()[0].toUpperCase();
    final specialization = _joinNonEmpty(
      [profile['specialization'], profile['sub_specialization']],
      fallback: 'Profil dokter belum lengkap',
    );
    final hospital = profile['hospital_name']?.toString() ?? 'Rumah sakit belum ditentukan';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [DoctorUi.primaryDark, DoctorUi.primary],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: DoctorUi.cardRadius,
        boxShadow: [
          BoxShadow(
            color: DoctorUi.primary.withOpacity(0.24),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white.withOpacity(0.18),
                child: Text(
                  initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Selamat datang,',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.78),
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      doctorName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '$specialization • $hospital',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.82),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              Switch.adaptive(
                value: isAvailable,
                onChanged: onAvailabilityChanged,
                activeColor: Colors.white,
                activeTrackColor: DoctorUi.mint,
                inactiveThumbColor: Colors.white,
                inactiveTrackColor: Colors.white.withOpacity(0.28),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.12),
              borderRadius: DoctorUi.smallRadius,
            ),
            child: Row(
              children: [
                Icon(
                  isAvailable ? Icons.circle : Icons.pause_circle_filled_rounded,
                  size: 12,
                  color: isAvailable ? const Color(0xFFB8F4D9) : Colors.white70,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isAvailable
                        ? 'Anda sedang menerima konsultasi baru'
                        : 'Anda sedang tidak menerima konsultasi baru',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: onToggleDetails,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    minimumSize: const Size(0, 32),
                  ),
                  child: Text(showDetails ? 'Tutup' : 'Profil'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PriorityCard extends StatelessWidget {
  final int waitingCount;
  final VoidCallback onOpenQueue;

  const _PriorityCard({required this.waitingCount, required this.onOpenQueue});

  @override
  Widget build(BuildContext context) {
    return DoctorSurface(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onOpenQueue,
        borderRadius: DoctorUi.cardRadius,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: DoctorUi.warning.withOpacity(0.12),
                  borderRadius: DoctorUi.smallRadius,
                ),
                child: const Icon(Icons.priority_high_rounded, color: DoctorUi.warning),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Perhatian utama',
                      style: TextStyle(color: DoctorUi.ink, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      waitingCount == 0
                          ? 'Tidak ada konsultasi yang perlu ditangani sekarang.'
                          : '$waitingCount konsultasi menunggu respons Anda.',
                      style: const TextStyle(
                        color: DoctorUi.mutedInk,
                        fontSize: 13,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: DoctorUi.mutedInk),
            ],
          ),
        ),
      ),
    );
  }
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
        const Text(
          'Profil profesional',
          style: TextStyle(color: DoctorUi.ink, fontSize: 16, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
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
      padding: const EdgeInsets.only(bottom: 9),
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

class _ConsultationTile extends StatelessWidget {
  final Map<String, dynamic> item;

  const _ConsultationTile({required this.item});

  @override
  Widget build(BuildContext context) {
    final id = item['id']?.toString() ?? '';
    final patient = item['patient_name']?.toString() ?? 'Pasien';
    final complaint = item['chief_complaint']?.toString() ?? 'Keluhan belum tersedia';
    final status = item['status']?.toString() ?? '';
    final urgency = item['urgency']?.toString() ?? 'NORMAL';
    final createdAt = item['created_at']?.toString() ?? '-';
    final isUrgent = urgency.toUpperCase() == 'URGENT' || urgency.toUpperCase() == 'EMERGENCY';

    return DoctorSurface(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: id.isEmpty ? null : () => context.push('/doctor/consultations/$id'),
        borderRadius: DoctorUi.cardRadius,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: DoctorUi.primary.withOpacity(0.11),
                child: const Icon(Icons.person_outline_rounded, color: DoctorUi.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            patient,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: DoctorUi.ink, fontWeight: FontWeight.w800),
                          ),
                        ),
                        if (isUrgent)
                          const DoctorStatusPill(
                            label: 'Prioritas',
                            color: DoctorUi.danger,
                            icon: Icons.priority_high_rounded,
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    DoctorStatusPill.fromStatus(status),
                    const SizedBox(height: 8),
                    Text(
                      complaint,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: DoctorUi.mutedInk, fontSize: 13, height: 1.35),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      'Dibuat $createdAt • Prioritas $urgency',
                      style: const TextStyle(color: DoctorUi.mutedInk, fontSize: 11),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right_rounded, color: DoctorUi.mutedInk),
            ],
          ),
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
            child: Text(message, style: const TextStyle(color: DoctorUi.ink, fontSize: 13)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
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
