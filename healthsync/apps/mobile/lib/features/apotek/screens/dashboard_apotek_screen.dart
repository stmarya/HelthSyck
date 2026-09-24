import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/providers/pharmacy_provider.dart';
import '../../../shared/widgets/health_card.dart';
import '../../../shared/widgets/section_header.dart';

/// Dashboard utama untuk role Apotek
class DashboardApotekScreen extends ConsumerStatefulWidget {
  const DashboardApotekScreen({super.key});

  @override
  ConsumerState<DashboardApotekScreen> createState() =>
      _DashboardApotekScreenState();
}

class _DashboardApotekScreenState
    extends ConsumerState<DashboardApotekScreen> {
  @override
  void initState() {
    super.initState();
    // Muat data saat pertama kali buka
    Future.microtask(() {
      ref.read(resepProvider.notifier).fetchResep();
      ref.read(obatProvider.notifier).fetchObat();
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final stat = ref.watch(apotekStatProvider);
    final resepState = ref.watch(resepProvider);
    final obatState = ref.watch(obatProvider);

    // Hitung obat hampir habis (stok < minimum)
    final obatKritis = obatState.items
        .where((o) => o.stokMinimum != null && o.stok < (o.stokMinimum ?? 0))
        .length;

    return Scaffold(
      backgroundColor: AppTheme.abu100,
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(resepProvider.notifier).fetchResep();
          await ref.read(obatProvider.notifier).fetchObat();
        },
        child: CustomScrollView(
          slivers: [
            // ── App Bar ───────────────────────────────────
            SliverAppBar(
              expandedHeight: 160,
              floating: false,
              pinned: true,
              backgroundColor: Colors.white,
              foregroundColor: AppTheme.abu900,
              elevation: 0,
              actions: [
                IconButton(
                  icon: const Icon(Icons.logout_rounded),
                  tooltip: 'Keluar',
                  onPressed: () =>
                      ref.read(authProvider.notifier).logout(),
                ),
              ],
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: AppTheme.apotekGradient(),
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
                                  color: Colors.white.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(AppTheme.rS),
                                ),
                                child: const Icon(
                                  Icons.local_pharmacy_rounded,
                                  color: Colors.white,
                                  size: 28,
                                ),
                              ),
                              const SizedBox(width: AppTheme.sM),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Selamat datang,',
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.85),
                                        fontSize: 13,
                                      ),
                                    ),
                                    Text(
                                      user?.name ?? 'Apoteker',
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
                          const SizedBox(height: AppTheme.sS),
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
                  // ── KPI Grid ─────────────────────────────────
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: AppTheme.sS,
                    mainAxisSpacing: AppTheme.sS,
                    childAspectRatio: 1.5,
                    children: [
                      KpiCard(
                        label: 'Resep Menunggu',
                        value: '${stat['menunggu'] ?? 0}',
                        icon: Icons.receipt_long_rounded,
                        color: AppTheme.peringatan,
                        onTap: () => context.push('/apotek/resep'),
                      ),
                      KpiCard(
                        label: 'Sedang Diproses',
                        value: '${stat['diproses'] ?? 0}',
                        icon: Icons.hourglass_top_rounded,
                        color: AppTheme.info,
                        onTap: () => context.push('/apotek/resep'),
                      ),
                      KpiCard(
                        label: 'Siap Diambil',
                        value: '${stat['siap'] ?? 0}',
                        icon: Icons.check_circle_rounded,
                        color: AppTheme.sukses,
                        onTap: () => context.push('/apotek/resep'),
                      ),
                      KpiCard(
                        label: 'Stok Kritis',
                        value: '$obatKritis',
                        icon: Icons.warning_amber_rounded,
                        color: AppTheme.bahaya,
                        onTap: () => context.push('/apotek/obat'),
                      ),
                    ],
                  ),

                  const SizedBox(height: AppTheme.sL),

                  // ── Menu Navigasi ─────────────────────────────
                  const SectionHeader(title: 'Menu Utama'),
                  const SizedBox(height: AppTheme.sM),
                  _NavGrid(items: [
                    _NavItem(
                      icon: Icons.receipt_long_rounded,
                      label: 'Resep Masuk',
                      sublabel: '${stat['total'] ?? 0} resep',
                      color: AppTheme.sukses,
                      route: '/apotek/resep',
                    ),
                    _NavItem(
                      icon: Icons.medication_rounded,
                      label: 'Kelola Obat',
                      sublabel: '${obatState.items.length} jenis obat',
                      color: AppTheme.info,
                      route: '/apotek/obat',
                    ),
                    _NavItem(
                      icon: Icons.history_rounded,
                      label: 'Riwayat',
                      sublabel: '${stat['selesai'] ?? 0} selesai',
                      color: AppTheme.peringatan,
                      route: '/apotek/history',
                    ),
                    _NavItem(
                      icon: Icons.person_rounded,
                      label: 'Profil',
                      sublabel: user?.email ?? '',
                      color: AppTheme.abu500,
                      route: '/profile',
                    ),
                  ]),

                  const SizedBox(height: AppTheme.sL),

                  // ── Resep Terbaru ─────────────────────────────
                  SectionHeader(
                    title: 'Resep Terbaru',
                    actionLabel: 'Lihat Semua',
                    onAction: () => context.push('/apotek/resep'),
                  ),
                  const SizedBox(height: AppTheme.sM),

                  if (resepState.isLoading)
                    const Center(child: CircularProgressIndicator())
                  else if (resepState.items.isEmpty)
                    HealthCard(
                      child: const Padding(
                        padding: EdgeInsets.all(AppTheme.sM),
                        child: Center(
                          child: Text(
                            'Belum ada resep masuk',
                            style: TextStyle(color: AppTheme.abu500),
                          ),
                        ),
                      ),
                    )
                  else
                    ...resepState.items.take(3).map(
                      (r) => Padding(
                        padding: const EdgeInsets.only(bottom: AppTheme.sS),
                        child: _ResepCard(resep: r),
                      ),
                    ),

                  const SizedBox(height: 80),
                ]),
              ),
            ),
          ],
        ),
      ),

      // ── Bottom Nav ─────────────────────────────────
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
            case 0: context.go('/apotek'); break;
            case 1: context.go('/apotek/resep'); break;
            case 2: context.go('/apotek/obat'); break;
            case 3: context.go('/apotek/history'); break;
          }
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_rounded),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_rounded),
            label: 'Resep',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.medication_rounded),
            label: 'Obat',
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

// ── Widget Pendukung ───────────────────────────────────────────────────────────

class _NavItem {
  final IconData icon;
  final String label;
  final String sublabel;
  final Color color;
  final String route;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.color,
    required this.route,
  });
}

class _NavGrid extends StatelessWidget {
  final List<_NavItem> items;
  const _NavGrid({required this.items});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: AppTheme.sS,
      mainAxisSpacing: AppTheme.sS,
      childAspectRatio: 1.6,
      children: items
          .map((item) => HealthCard(
                onTap: () => context.push(item.route),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: item.color.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(AppTheme.rS),
                      ),
                      child: Icon(item.icon, color: item.color, size: 22),
                    ),
                    const SizedBox(width: AppTheme.sS),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.label,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.abu900,
                              )),
                          Text(item.sublabel,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppTheme.abu500,
                              )),
                        ],
                      ),
                    ),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

class _ResepCard extends StatelessWidget {
  final dynamic resep;
  const _ResepCard({required this.resep});

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.sukses.withOpacity(0.1),
              borderRadius: BorderRadius.circular(AppTheme.rS),
            ),
            child: const Icon(Icons.receipt_rounded,
                color: AppTheme.sukses, size: 20),
          ),
          const SizedBox(width: AppTheme.sM),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(resep.pasienNama,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                Text('${resep.items.length} item obat · ${resep.dokterNama}',
                    style: const TextStyle(
                        fontSize: 12, color: AppTheme.abu500)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: _statusColor(resep.status).withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              _statusLabel(resep.status),
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: _statusColor(resep.status)),
            ),
          ),
        ],
      ),
    );
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'COMPLETED': return AppTheme.sukses;
      case 'READY':     return AppTheme.info;
      case 'PROCESSING': return AppTheme.peringatan;
      default:          return AppTheme.abu500;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'PENDING':    return 'Menunggu';
      case 'PROCESSING': return 'Diproses';
      case 'READY':      return 'Siap';
      case 'COMPLETED':  return 'Selesai';
      default:           return s;
    }
  }
}
