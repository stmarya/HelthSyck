import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/app_theme.dart';
import '../core/providers/auth_provider.dart';
import '../core/providers/vitals_provider.dart';
import '../core/providers/consultation_provider.dart';
import '../shared/widgets/health_card.dart';
import '../shared/widgets/section_header.dart';

/// Dashboard Pasien — versi modernisasi
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    final vitals = ref.watch(latestVitalsProvider);
    final consultState = ref.watch(consultationProvider);

    // Muat data saat pertama kali
    ref.listen(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        final patientId = next.user?.patientId ?? next.user?.id ?? '';
        if (patientId.isNotEmpty) {
          ref.read(vitalsProvider.notifier).connect(patientId);
          ref.read(consultationProvider.notifier).fetchConsultations();
        }
      }
    });

    final activeConsult = consultState.items
        .where((c) => c.status == 'in_progress')
        .firstOrNull;

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      body: RefreshIndicator(
        onRefresh: () async {
          final patientId = user?.patientId ?? user?.id ?? '';
          if (patientId.isNotEmpty) {
            ref.read(vitalsProvider.notifier).connect(patientId);
          }
          await ref.read(consultationProvider.notifier).fetchConsultations();
        },
        child: CustomScrollView(
          slivers: [
            // ── App Bar ────────────────────────────────────
            SliverAppBar(
              expandedHeight: 180,
              floating: false,
              pinned: true,
              backgroundColor: Colors.white,
              foregroundColor: AppTheme.abu900,
              elevation: 0,
              actions: [
                IconButton(
                  icon: const Icon(Icons.person_rounded),
                  tooltip: 'Profil',
                  onPressed: () => context.push('/profile'),
                ),
                IconButton(
                  icon: const Icon(Icons.logout_rounded),
                  tooltip: 'Keluar',
                  onPressed: () => ref.read(authProvider.notifier).logout(),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: AppTheme.pasienGradient(),
                  ),
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(AppTheme.sM),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          const Icon(Icons.health_and_safety_rounded,
                              color: Colors.white70, size: 32),
                          const SizedBox(height: AppTheme.sS),
                          Text(
                            'Halo, ${user?.name?.split(' ').first ?? 'Pengguna'}!',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            'Pantau kesehatan Anda hari ini',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.85),
                              fontSize: 14,
                            ),
                          ),
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
                  // ── Konsultasi Aktif ─────────────────────────
                  if (activeConsult != null) ...[
                    HealthCard(
                      borderColor: AppTheme.sukses.withOpacity(0.5),
                      onTap: () => context.push(
                          '/consultations/${activeConsult.id}'),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.sukses.withOpacity(0.12),
                              borderRadius:
                                  BorderRadius.circular(AppTheme.rS),
                            ),
                            child: const Icon(Icons.videocam_rounded,
                                color: AppTheme.sukses, size: 22),
                          ),
                          const SizedBox(width: AppTheme.sM),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Konsultasi Sedang Berlangsung',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.sukses,
                                    fontSize: 14,
                                  ),
                                ),
                                Text(
                                  activeConsult.doctorName ?? 'Dokter',
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AppTheme.abu500),
                                ),
                              ],
                            ),
                          ),
                          FilledButton(
                            onPressed: () => context.push(
                                '/consultations/${activeConsult.id}'),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppTheme.sukses,
                              minimumSize: const Size(60, 36),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12),
                            ),
                            child: const Text('Masuk',
                                style: TextStyle(fontSize: 12)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppTheme.sM),
                  ],

                  // ── Tanda Vital ───────────────────────────────
                  SectionHeader(
                    title: 'Tanda Vital',
                    actionLabel: 'Live',
                    onAction: () => context.push('/vitals'),
                  ),
                  const SizedBox(height: AppTheme.sS),
                  HealthCard(
                    child: vitals == null
                        ? const Padding(
                            padding: EdgeInsets.symmetric(
                                vertical: AppTheme.sM),
                            child: Row(
                              children: [
                                Icon(Icons.watch_later_outlined,
                                    color: AppTheme.abu500, size: 18),
                                SizedBox(width: AppTheme.sS),
                                Expanded(
                                  child: Text(
                                    'Belum ada data vital — hubungkan perangkat wearable Anda',
                                    style: TextStyle(
                                        color: AppTheme.abu500,
                                        fontSize: 13),
                                  ),
                                ),
                              ],
                            ),
                          )
                        : Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceAround,
                            children: [
                              _VitalItem(
                                label: 'Detak Jantung',
                                value: vitals.heartRate
                                    .toStringAsFixed(0),
                                unit: 'bpm',
                                icon: Icons.favorite_rounded,
                                color: AppTheme.bahaya,
                              ),
                              _VitalItem(
                                label: 'SpO₂',
                                value:
                                    vitals.spo2.toStringAsFixed(1),
                                unit: '%',
                                icon: Icons.air_rounded,
                                color: AppTheme.info,
                              ),
                              _VitalItem(
                                label: 'Tekanan',
                                value:
                                    '${vitals.systolic.toStringAsFixed(0)}/${vitals.diastolic.toStringAsFixed(0)}',
                                unit: 'mmHg',
                                icon: Icons.water_drop_rounded,
                                color: AppTheme.peringatan,
                              ),
                              _VitalItem(
                                label: 'Suhu',
                                value: vitals.temperature
                                    .toStringAsFixed(1),
                                unit: '°C',
                                icon: Icons.thermostat_rounded,
                                color: AppTheme.sukses,
                              ),
                            ],
                          ),
                  ),

                  const SizedBox(height: AppTheme.sL),

                  // ── Aksi Cepat ────────────────────────────────
                  const SectionHeader(title: 'Layanan Kesehatan'),
                  const SizedBox(height: AppTheme.sS),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: AppTheme.sS,
                    mainAxisSpacing: AppTheme.sS,
                    childAspectRatio: 0.95,
                    children: [
                      _AksiCepat(
                        icon: Icons.video_call_rounded,
                        label: 'Konsultasi',
                        color: AppTheme.pasienGradient().colors.first,
                        onTap: () => context.push('/consultations/book'),
                      ),
                      _AksiCepat(
                        icon: Icons.monitor_heart_rounded,
                        label: 'Tanda Vital',
                        color: AppTheme.bahaya,
                        onTap: () => context.push('/vitals'),
                      ),
                      _AksiCepat(
                        icon: Icons.local_pharmacy_rounded,
                        label: 'Resep',
                        color: AppTheme.sukses,
                        onTap: () => context.push('/prescriptions'),
                      ),
                      _AksiCepat(
                        icon: Icons.local_hospital_rounded,
                        label: 'Cari RS',
                        color: AppTheme.info,
                        onTap: () => context.push('/hospitals'),
                      ),
                      _AksiCepat(
                        icon: Icons.history_rounded,
                        label: 'Riwayat',
                        color: AppTheme.peringatan,
                        onTap: () => context.push('/consultations'),
                      ),
                      _AksiCepat(
                        icon: Icons.emergency_rounded,
                        label: 'Ambulans',
                        color: AppTheme.bahaya,
                        onTap: () => context.push('/ambulance'),
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
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppTheme.abu200)),
        ),
        child: BottomNavigationBar(
          currentIndex: 0,
          onTap: (i) {
            switch (i) {
              case 0:
                context.go('/dashboard');
                break;
              case 1:
                context.go('/consultations');
                break;
              case 2:
                context.go('/vitals');
                break;
              case 3:
                context.go('/profile');
                break;
            }
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_rounded),
              label: 'Beranda',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.videocam_rounded),
              label: 'Konsultasi',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.monitor_heart_rounded),
              label: 'Vital',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_rounded),
              label: 'Profil',
            ),
          ],
        ),
      ),
    );
  }
}

// ── Widget Pendukung ─────────────────────────────────────────────────────────

class _VitalItem extends StatelessWidget {
  final String label;
  final String value;
  final String unit;
  final IconData icon;
  final Color color;

  const _VitalItem({
    required this.label,
    required this.value,
    required this.unit,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.10),
            borderRadius: BorderRadius.circular(AppTheme.rS),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 16,
            color: color,
          ),
        ),
        Text(unit,
            style: const TextStyle(fontSize: 9, color: AppTheme.abu500)),
        Text(label,
            style: const TextStyle(
                fontSize: 10,
                color: AppTheme.abu700,
                fontWeight: FontWeight.w500),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ],
    );
  }
}

class _AksiCepat extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _AksiCepat({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      padding: const EdgeInsets.all(AppTheme.sS),
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.10),
              borderRadius: BorderRadius.circular(AppTheme.rS),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(height: AppTheme.sS),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.abu700,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
