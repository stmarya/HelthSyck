import 'package:flutter/material.dart';

/// Visual language for the Doctor workspace.
///
/// The Doctor experience uses a calmer blue/teal palette, generous spacing,
/// and quiet surfaces so clinical information remains the visual priority.
class DoctorUi {
  DoctorUi._();

  static const ink = Color(0xFF17324D);
  static const mutedInk = Color(0xFF6D7F91);
  static const primary = Color(0xFF2783DE);
  static const primaryDark = Color(0xFF165CA8);
  static const mint = Color(0xFF4FAE8A);
  static const canvas = Color(0xFFF7F9FC);
  static const surface = Colors.white;
  static const border = Color(0xFFE4EBF2);
  static const warning = Color(0xFFD9822B);
  static const danger = Color(0xFFD95C61);

  static BorderRadius get cardRadius => BorderRadius.circular(18);
  static BorderRadius get smallRadius => BorderRadius.circular(12);

  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: ink.withOpacity(0.06),
          blurRadius: 24,
          offset: const Offset(0, 8),
        ),
      ];
}

class DoctorSurface extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final EdgeInsetsGeometry? margin;

  const DoctorSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color = DoctorUi.surface,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: DoctorUi.cardRadius,
        border: Border.all(color: DoctorUi.border),
        boxShadow: DoctorUi.cardShadow,
      ),
      child: child,
    );
  }
}

class DoctorStatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const DoctorStatusPill({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  factory DoctorStatusPill.fromStatus(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING':
        return const DoctorStatusPill(
          label: 'Menunggu',
          color: DoctorUi.warning,
          icon: Icons.schedule_rounded,
        );
      case 'ACCEPTED':
        return const DoctorStatusPill(
          label: 'Siap dimulai',
          color: DoctorUi.primary,
          icon: Icons.play_circle_outline_rounded,
        );
      case 'IN_PROGRESS':
        return const DoctorStatusPill(
          label: 'Sedang berlangsung',
          color: DoctorUi.mint,
          icon: Icons.forum_outlined,
        );
      case 'COMPLETED':
        return const DoctorStatusPill(
          label: 'Selesai',
          color: DoctorUi.mutedInk,
          icon: Icons.check_circle_outline_rounded,
        );
      default:
        return DoctorStatusPill(
          label: status.isEmpty ? 'Belum diketahui' : status,
          color: DoctorUi.mutedInk,
          icon: Icons.info_outline_rounded,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.11),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class DoctorSectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const DoctorSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: DoctorUi.ink,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    color: DoctorUi.mutedInk,
                    fontSize: 13,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class DoctorMetricCard extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  const DoctorMetricCard({
    super.key,
    required this.value,
    required this.label,
    required this.icon,
    this.color = DoctorUi.primary,
  });

  @override
  Widget build(BuildContext context) {
    return DoctorSurface(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withOpacity(0.11),
              borderRadius: DoctorUi.smallRadius,
            ),
            child: Icon(icon, color: color, size: 19),
          ),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(
              color: DoctorUi.ink,
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              color: DoctorUi.mutedInk,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class DoctorEmptyState extends StatelessWidget {
  final String title;
  final String message;
  final IconData icon;

  const DoctorEmptyState({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.event_available_rounded,
  });

  @override
  Widget build(BuildContext context) {
    return DoctorSurface(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: DoctorUi.canvas,
              borderRadius: DoctorUi.smallRadius,
            ),
            child: Icon(icon, color: DoctorUi.mutedInk),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: DoctorUi.ink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: const TextStyle(
                    color: DoctorUi.mutedInk,
                    fontSize: 13,
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

class DoctorQuickAction extends StatelessWidget {
  final String label;
  final String caption;
  final IconData icon;
  final VoidCallback onTap;

  const DoctorQuickAction({
    super.key,
    required this.label,
    required this.caption,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: DoctorUi.smallRadius,
      child: Ink(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: DoctorUi.canvas,
          borderRadius: DoctorUi.smallRadius,
          border: Border.all(color: DoctorUi.border),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: DoctorUi.primary.withOpacity(0.11),
                borderRadius: DoctorUi.smallRadius,
              ),
              child: Icon(icon, color: DoctorUi.primary, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      color: DoctorUi.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    caption,
                    style: const TextStyle(
                      color: DoctorUi.mutedInk,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_rounded, color: DoctorUi.primary, size: 20),
          ],
        ),
      ),
    );
  }
}