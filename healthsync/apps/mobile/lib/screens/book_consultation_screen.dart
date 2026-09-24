import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../core/providers/consultation_provider.dart';
import '../core/providers/auth_provider.dart';

class BookConsultationScreen extends ConsumerStatefulWidget {
  const BookConsultationScreen({super.key});

  @override
  ConsumerState<BookConsultationScreen> createState() =>
      _BookConsultationScreenState();
}

class _BookConsultationScreenState
    extends ConsumerState<BookConsultationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _complaintCtrl = TextEditingController();
  final _doctorIdCtrl = TextEditingController();

  String _type = 'telemedicine';
  DateTime? _scheduledAt;
  bool _submitting = false;

  @override
  void dispose() {
    _complaintCtrl.dispose();
    _doctorIdCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(hours: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (time == null || !mounted) return;

    setState(() {
      _scheduledAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_scheduledAt == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a date and time')),
      );
      return;
    }

    setState(() => _submitting = true);

    final consultation = await ref
        .read(consultationProvider.notifier)
        .bookConsultation(
          patientId: ref.read(authProvider).user?.patientId ?? '',
          preferredDoctorId: _doctorIdCtrl.text.trim(),
          type: _type,
          chiefComplaint: _complaintCtrl.text.trim(),
          scheduledAt: _scheduledAt!,
        );

    if (!mounted) return;
    setState(() => _submitting = false);

    if (consultation != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Consultation booked successfully'),
          backgroundColor: Colors.green,
        ),
      );
      context.go('/consultations/${consultation.id}');
    } else {
      final error = ref.read(consultationProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error ?? 'Booking failed. Please try again.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Book Consultation')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Type selector
                Text(
                  'Consultation Type',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'telemedicine',
                      label: Text('Telemedicine'),
                      icon: Icon(Icons.videocam_outlined),
                    ),
                    ButtonSegment(
                      value: 'in_person',
                      label: Text('In Person'),
                      icon: Icon(Icons.local_hospital_outlined),
                    ),
                  ],
                  selected: {_type},
                  onSelectionChanged: (v) =>
                      setState(() => _type = v.first),
                ),
                const SizedBox(height: 20),

                // Doctor ID (in production: searchable doctor list)
                TextFormField(
                  controller: _doctorIdCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Doctor ID',
                    hintText: 'Enter doctor ID or search',
                    prefixIcon: Icon(Icons.person_search_outlined),
                  ),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) {
                      return 'Doctor is required';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Chief complaint
                TextFormField(
                  controller: _complaintCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Chief Complaint',
                    hintText: 'Describe your main symptom or concern',
                    alignLabelWithHint: true,
                    prefixIcon: Icon(Icons.notes_outlined),
                  ),
                  validator: (v) {
                    if (v == null || v.trim().isEmpty) {
                      return 'Please describe your chief complaint';
                    }
                    if (v.trim().length < 10) {
                      return 'Please provide more detail (min 10 chars)';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Date & time picker
                Text(
                  'Scheduled Date & Time',
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _pickDateTime,
                  icon: const Icon(Icons.calendar_today_outlined),
                  label: Text(
                    _scheduledAt == null
                        ? 'Select date and time'
                        : DateFormat('dd MMM yyyy, HH:mm')
                            .format(_scheduledAt!),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    alignment: Alignment.centerLeft,
                  ),
                ),
                const SizedBox(height: 32),

                // Submit
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Book Consultation',
                          style: TextStyle(fontSize: 16),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
