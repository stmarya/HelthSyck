import 'package:flutter/material.dart';
import '../../core/app_theme.dart';

/// HealthCard — Kartu utama desain system HealthSync
/// Digunakan di semua role (pasien, apotek, driver, ambulans)
class HealthCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final Color? borderColor;
  final Color? backgroundColor;
  final bool hasShadow;

  const HealthCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.borderColor,
    this.backgroundColor,
    this.hasShadow = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.rM),
        border: Border.all(color: borderColor ?? AppTheme.abu200),
        boxShadow: hasShadow ? AppTheme.shadowS : null,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(AppTheme.rM),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppTheme.rM),
          onTap: onTap,
          child: Padding(
            padding: padding ?? const EdgeInsets.all(AppTheme.sM),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// GradientCard — Kartu dengan latar gradient (untuk hero section)
class GradientCard extends StatelessWidget {
  final Widget child;
  final LinearGradient gradient;
  final EdgeInsetsGeometry? padding;
  final double? height;

  const GradientCard({
    super.key,
    required this.child,
    required this.gradient,
    this.padding,
    this.height,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppTheme.rL),
        boxShadow: AppTheme.shadowM,
      ),
      child: Padding(
        padding: padding ?? const EdgeInsets.all(AppTheme.sL),
        child: child,
      ),
    );
  }
}

/// KpiCard — Kartu ringkasan metrik / KPI
class KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String? sublabel;
  final VoidCallback? onTap;

  const KpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
    this.sublabel,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return HealthCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(AppTheme.sS),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.10),
                  borderRadius: BorderRadius.circular(AppTheme.rS),
                ),
                child: Icon(icon, color: color, size: 20),
              ),
              const Spacer(),
              if (onTap != null)
                Icon(Icons.arrow_forward_ios, size: 12, color: AppTheme.abu500),
            ],
          ),
          const SizedBox(height: AppTheme.sS + 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: color,
              height: 1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: AppTheme.abu500,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (sublabel != null) ...[
            const SizedBox(height: 2),
            Text(
              sublabel!,
              style: const TextStyle(fontSize: 11, color: AppTheme.abu500),
            ),
          ],
        ],
      ),
    );
  }
}
