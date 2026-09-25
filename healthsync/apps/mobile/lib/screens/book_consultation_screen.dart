import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  bool _submitting = false;

  @override
  void dispose() {
    _complaintCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);

    final consultation = await ref
        .read(consultationProvider.notifier)
        .bookConsultation(
          patientId: ref.read(authProvider).user?.patientId ?? '',
          chiefComplaint: _complaintCtrl.text.trim(),
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

                const SizedBox(height: 12),

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
