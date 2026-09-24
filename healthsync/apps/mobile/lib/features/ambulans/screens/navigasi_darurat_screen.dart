import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/app_theme.dart';
import '../../../core/models/ambulance_task.dart';
import '../../../core/providers/ambulance_provider.dart';
import '../../../shared/widgets/status_badge.dart';

/// Layar navigasi darurat ambulans dengan simulasi peta
class NavigasiDaruratScreen extends ConsumerWidget {
  final String taskId;
  const NavigasiDaruratScreen({super.key, required this.taskId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(ambulansProvider);
    final task = state.tugasHistory
        .where((t) => t.id == taskId)
        .firstOrNull ?? state.tugasAktif;

    if (task == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Navigasi Darurat')),
        body: const Center(child: Text('Tugas tidak ditemukan')),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.abu900,
      appBar: AppBar(
        title: const Text('Navigasi Darurat'),
        backgroundColor: AppTheme.abu900,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          // ── Peta Simulasi Darurat ──────────────────────
          Expanded(
            child: Stack(
              children: [
                Container(
                  color: const Color(0xFF0D1B2A),
                  child: CustomPaint(
                    painter: _DaruratMapPainter(),
                    child: const SizedBox.expand(),
                  ),
                ),

                // Marker pasien
                const Positioned(
                  top: 100,
                  left: 100,
                  child: _DaruratMarker(
                    icon: Icons.person_pin_circle_rounded,
                    color: AppTheme.bahaya,
                    label: 'Pasien',
                  ),
                ),

                // Marker RS tujuan
                const Positioned(
                  bottom: 120,
                  right: 80,
                  child: _DaruratMarker(
                    icon: Icons.local_hospital_rounded,
                    color: AppTheme.info,
                    label: 'RS Tujuan',
                  ),
                ),

                // Marker posisi ambulans
                const Positioned(
                  top: 180,
                  left: 160,
                  child: _DaruratMarker(
                    icon: Icons.emergency_rounded,
                    color: Colors.white,
                    label: 'Ambulans',
                  ),
                ),

                // Overlay info
                Positioned(
                  top: AppTheme.sM,
                  left: AppTheme.sM,
                  right: AppTheme.sM,
                  child: Container(
                    padding: const EdgeInsets.all(AppTheme.sM),
                    decoration: BoxDecoration(
                      color: AppTheme.bahaya.withOpacity(0.9),
                      borderRadius: BorderRadius.circular(AppTheme.rM),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.emergency_rounded,
                            color: Colors.white, size: 20),
                        const SizedBox(width: AppTheme.sS),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'DARURAT — ${task.pasienNama}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                task.alamatPasien,
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.85),
                                  fontSize: 11,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Panel Bawah ────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(AppTheme.sM),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(task.pasienNama,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16)),
                          Text(
                            'Tujuan: ${task.tujuanRS}',
                            style: const TextStyle(
                                fontSize: 12, color: AppTheme.abu500),
                          ),
                          if (task.kondisiPasien != null)
                            Text(
                              task.kondisiPasien!,
                              style: const TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.bahaya,
                                  fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                    StatusBadge.auto(task.status),
                  ],
                ),
                const SizedBox(height: AppTheme.sM),

                if (task.status == StatusAmbulans.menuju)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        ref.read(ambulansProvider.notifier)
                            .updateStatusTugas(task.id, StatusAmbulans.tiba);
                        context.pop();
                      },
                      icon: const Icon(Icons.where_to_vote_rounded,
                          size: 18),
                      label: const Text('Konfirmasi Tiba di Pasien'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.peringatan,
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  )
                else if (task.status == StatusAmbulans.membawa)
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: () {
                        ref.read(ambulansProvider.notifier)
                            .updateStatusTugas(task.id, StatusAmbulans.selesai);
                        context.pop();
                      },
                      icon: const Icon(Icons.check_rounded, size: 18),
                      label: const Text('Pasien Tiba di RS — Selesai'),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.sukses,
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.arrow_back_rounded, size: 18),
                      label: const Text('Kembali'),
                      style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 48)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DaruratMarker extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;

  const _DaruratMarker(
      {required this.icon, required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                  color: color.withOpacity(0.6),
                  blurRadius: 16,
                  spreadRadius: 3)
            ],
          ),
          child: Icon(icon, color: AppTheme.abu900, size: 18),
        ),
        Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.65),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(label,
              style: const TextStyle(color: Colors.white, fontSize: 9)),
        ),
      ],
    );
  }
}

class _DaruratMapPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final bg = Paint()..color = const Color(0xFF0D1B2A);
    canvas.drawRect(Offset.zero & size, bg);

    final gridPaint = Paint()
      ..color = const Color(0xFF1A2D40)
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 50) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += 50) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final roadPaint = Paint()
      ..color = const Color(0xFF243850)
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
        Offset(0, size.height * 0.5),
        Offset(size.width, size.height * 0.5),
        roadPaint);
    canvas.drawLine(
        Offset(size.width * 0.35, 0),
        Offset(size.width * 0.35, size.height),
        roadPaint);

    // Rute darurat (merah)
    final routePaint = Paint()
      ..color = AppTheme.bahaya
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(160, 190)
      ..lineTo(size.width * 0.35, 190)
      ..lineTo(size.width * 0.35, size.height * 0.5)
      ..lineTo(size.width - 80, size.height * 0.5)
      ..lineTo(size.width - 80, size.height - 100);
    canvas.drawPath(path, routePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
