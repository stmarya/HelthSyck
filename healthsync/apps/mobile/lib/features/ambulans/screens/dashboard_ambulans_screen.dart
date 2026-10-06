import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/realtime_location_tracker.dart';
import '../../../core/providers/ambulance_provider.dart';
import '../../../core/models/ambulance_task.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/section_header.dart';

/// Dashboard utama untuk role Ambulans
class DashboardAmbulansScreen extends ConsumerStatefulWidget {
  const DashboardAmbulansScreen({super.key});

  @override
  ConsumerState<DashboardAmbulansScreen> createState() =>
      _DashboardAmbulansScreenState();
}

class _DashboardAmbulansScreenState
    extends ConsumerState<DashboardAmbulansScreen> {
  RealtimeLocationTracker? _locationTracker;
  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      final userId = ref.read(authProvider).user?.id;
      ref.read(ambulansProvider.notifier).fetchTugas(driverUserId: userId);
      final auth = ref.read(authProvider);
      final token = auth.accessToken;
      final entityId = auth.user?.id;
      if (token != null && entityId != null && entityId.isNotEmpty) {
        _locationTracker = RealtimeLocationTracker(accessToken: token, entityId: entityId, entityType: 'AMBULANCE');
        await _locationTracker!.start();
      }
    });
  }

  @override
  void dispose() {
    final tracker = _locationTracker;
    if (tracker != null) unawaited(tracker.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final state = ref.watch(ambulansProvider);
    final stat = ref.watch(ambulansStatProvider);
    final adaTugasAktif = state.tugasAktif != null;

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(ambulansProvider.notifier).fetchTugas(),
        child: CustomScrollView(
          slivers: [
            // ── App Bar Darurat ────────────────────────────
            SliverAppBar(
              expandedHeight: 180,
              pinned: true,
              backgroundColor: Colors.white,
              foregroundColor: Colors.white,
              elevation: 0,
              actions: [
                IconButton(
                  icon: const Icon(Icons.logout_rounded),
                  onPressed: () =>
                      ref.read(authProvider.notifier).logout(),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: AppTheme.ambulansGradient(),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppTheme.sM),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color:
                                      Colors.white.withOpacity(0.2),
                                  borderRadius:
                                      BorderRadius.circular(AppTheme.rS),
                                ),
                                child: const Icon(
                                  Icons.emergency_rounded,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                              const SizedBox(width: AppTheme.sM),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Unit Ambulans',
                                      style: TextStyle(
                                        color: Colors.white
                                            .withOpacity(0.85),
                                        fontSize: 13,
                                      ),
                                    ),
                                    Text(
                                      user?.name ?? 'Petugas',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 20,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppTheme.sM),
                          // Status Unit
                          _StatusUnitBadge(
                              status: stat['statusUnit'] as String? ??
                                  StatusAmbulans.standby),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),

            SliverPadding(
              padding: const EdgeInsets.all(AppTheme.sM),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  // ── Tombol Darurat ────────────────────────────
                  if (!adaTugasAktif) ...[
                    _TombolDarurat(
                      onTap: () =>
                          context.push('/ambulans/panggilan'),
                    ),
                    const SizedBox(height: AppTheme.sL),
                  ],

                  // ── Tugas Aktif ───────────────────────────────
                  if (adaTugasAktif) ...[
                    const SectionHeader(title: 'Tugas Sedang Berjalan'),
                    const SizedBox(height: AppTheme.sS),
                    _TugasAktifCard(task: state.tugasAktif!),
                    const SizedBox(height: AppTheme.sL),
                  ],

                  // ── KPI ───────────────────────────────────────
                  Row(
                    children: [
                      Expanded(
                        child: KpiCard(
                          label: 'Total Tugas',
                          value:
                              '${stat['total'] ?? 0}',
                          icon: Icons.assignment_rounded,
                          color: AppTheme.ambulansGradient().colors.first,
                        ),
                      ),
                      const SizedBox(width: AppTheme.sS),
                      Expanded(
                        child: KpiCard(
                          label: 'Selesai',
                          value: '${stat['selesai'] ?? 0}',
                          icon: Icons.check_circle_rounded,
                          color: AppTheme.sukses,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: AppTheme.sL),

                  // ── Menu ──────────────────────────────────────
                  const SectionHeader(title: 'Menu'),
                  const SizedBox(height: AppTheme.sM),
                  Row(
                    children: [
                      Expanded(
                        child: HealthCard(
                          onTap: () =>
                              context.push('/ambulans/panggilan'),
                          child: const _MenuTile(
                            icon: Icons.add_alert_rounded,
                            label: 'Panggilan\nDarurat',
                            color: AppTheme.bahaya,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppTheme.sS),
                      Expanded(
                        child: HealthCard(
                          onTap: () =>
                              context.push('/ambulans/riwayat'),
                          child: const _MenuTile(
                            icon: Icons.history_rounded,
                            label: 'Riwayat\nTugas',
                            color: AppTheme.abu500,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildBottomNav(context, 0),
    );
  }

  Widget _buildBottomNav(BuildContext context, int index) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppTheme.abu200)),
      ),
      child: BottomNavigationBar(
        currentIndex: index,
        onTap: (i) {
          switch (i) {
            case 0:
              context.go('/ambulans');
              break;
            case 1:
              context.go('/ambulans/panggilan');
              break;
            case 2:
              context.go('/ambulans/riwayat');
              break;
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_rounded),
            label: 'Beranda',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.emergency_rounded),
            label: 'Darurat',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_rounded),
            label: 'Riwayat',
          ),
        ],
      ),
    );
  }
}

// ── Widget Pendukung ─────────────────────────────────────────────────────────

class _StatusUnitBadge extends StatelessWidget {
  final String status;
  const _StatusUnitBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final isStandby = status == StatusAmbulans.standby;
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.sM, vertical: AppTheme.sS),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(isStandby ? 0.25 : 0.15),
        borderRadius: BorderRadius.circular(AppTheme.rXL),
        border: Border.all(color: Colors.white.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: isStandby ? Colors.greenAccent : Colors.orangeAccent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: AppTheme.sS),
          Text(
            isStandby ? 'Unit Siaga — Siap Bertugas' : 'Sedang Bertugas',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TombolDarurat extends StatelessWidget {
  final VoidCallback onTap;
  const _TombolDarurat({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppTheme.sL),
        decoration: BoxDecoration(
          gradient: AppTheme.ambulansGradient(),
          borderRadius: BorderRadius.circular(AppTheme.rL),
          boxShadow: [
            BoxShadow(
              color: AppTheme.bahaya.withOpacity(0.35),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: const Column(
          children: [
            Icon(Icons.emergency_rounded, color: Colors.white, size: 48),
            SizedBox(height: AppTheme.sS),
            Text(
              'TERIMA PANGGILAN DARURAT',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'Tekan untuk melihat panggilan masuk',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TugasAktifCard extends StatelessWidget {
  final AmbulanceTask task;
  const _TugasAktifCard({required this.task});

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      borderColor: AppTheme.bahaya.withOpacity(0.4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.emergency_rounded,
                  color: AppTheme.bahaya, size: 18),
              const SizedBox(width: AppTheme.sS),
              const Text('Tugas Aktif',
                  style: TextStyle(
                      color: AppTheme.bahaya,
                      fontWeight: FontWeight.w700)),
              const Spacer(),
              StatusBadge.auto(task.status),
            ],
          ),
          const Divider(height: AppTheme.sM + AppTheme.sS),
          Text(task.pasienNama,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.location_on_rounded,
                  size: 14, color: AppTheme.abu500),
              const SizedBox(width: 4),
              Expanded(
                child: Text(task.alamatPasien,
                    style: const TextStyle(
                        fontSize: 13, color: AppTheme.abu500)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.local_hospital_rounded,
                  size: 14, color: AppTheme.info),
              const SizedBox(width: 4),
              Text(task.tujuanRS,
                  style: const TextStyle(
                      fontSize: 13, color: AppTheme.info)),
            ],
          ),
          if (task.kondisiPasien != null) ...[
            const SizedBox(height: AppTheme.sS),
            Container(
              padding: const EdgeInsets.all(AppTheme.sS),
              decoration: BoxDecoration(
                color: AppTheme.bahaya.withOpacity(0.07),
                borderRadius: BorderRadius.circular(AppTheme.rS),
              ),
              child: Row(
                children: [
                  const Icon(Icons.medical_information_rounded,
                      size: 14, color: AppTheme.bahaya),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(task.kondisiPasien!,
                        style: const TextStyle(
                            fontSize: 12, color: AppTheme.abu700)),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppTheme.sM),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () =>
                  context.push('/ambulans/navigasi/${task.id}'),
              icon: const Icon(Icons.navigation_rounded, size: 18),
              label: const Text('Buka Navigasi Darurat'),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.bahaya,
                minimumSize: const Size(0, 44),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _MenuTile(
      {required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.sM),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.10),
              borderRadius: BorderRadius.circular(AppTheme.rS),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: AppTheme.sS),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

