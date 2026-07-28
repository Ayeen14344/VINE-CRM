-- VINE Pulse: richer hiring, orientation/ADP, and training status visibility.
-- Apply after 20260727090000_dsp_vertical_report_templates.sql.

update public.vertical_report_templates
set
  columns = '[
    {"key":"candidate_name","label":"Name from indeed or smart recruiter","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Phone Number","type":"phone"},
    {"key":"activity_date","label":"Date","type":"date"},
    {"key":"interview_invite_sent","label":"Invite for Interview Sent","type":"yes_no"},
    {"key":"scheduled_interview","label":"Scheduled Interview","type":"date"},
    {"key":"interview_confirmed","label":"Confirm Interview","type":"yes_no"},
    {"key":"no_response","label":"No response","type":"yes_no"},
    {"key":"rescheduled","label":"Rescheduled","type":"date"},
    {"key":"interview_result","label":"Interview Result","type":"pass_fail"}
  ]'::jsonb,
  updated_at = now()
where vertical_id = '00000000-0000-4000-8000-000000000101'
  and sheet_name = 'Sourcing and hiring';

update public.vertical_report_templates
set
  columns = '[
    {"key":"candidate_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Phone Number","type":"phone"},
    {"key":"background_check","label":"Background Check","type":"pass_fail"},
    {"key":"clinic_details_sent","label":"Clinic Details Sent","type":"yes_no"},
    {"key":"drug_test","label":"Drug Test","type":"pass_fail"},
    {"key":"cortex_onboarded","label":"Cortex Onboarded","type":"yes_no","aliases":["Onboarded in Cortex","Added to Cortex"]}
  ]'::jsonb,
  updated_at = now()
where vertical_id = '00000000-0000-4000-8000-000000000101'
  and sheet_name = 'Background check';

update public.vertical_report_templates
set
  source_filename = 'Vertical 2 - Orientation and ADP Set-up.xlsx',
  columns = '[
    {"key":"candidate_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Number","type":"phone"},
    {"key":"orientation_docs_adp_status","label":"Orientation docs/ADP","type":"completed_pending_offboarded"},
    {"key":"safety_standard_sent","label":"Safety Standard Sent","type":"date"},
    {"key":"safety_standard_completed","label":"Safety Standard Completed","type":"date"},
    {"key":"orientation_sent","label":"Orientation Sent","type":"date"},
    {"key":"orientation_completed","label":"Orientation Completed","type":"date"},
    {"key":"adp_payroll_setup","label":"ADP Payroll Set-up","type":"date"},
    {"key":"adp_payroll_completed","label":"ADP Payroll Completed","type":"date"},
    {"key":"training_schedule","label":"Training Schedule","type":"active_date_incomplete"},
    {"key":"remarks","label":"Remarks","type":"completed_in_progress_offboarded_pending_scheduling"},
    {"key":"note","label":"Note","type":"text"}
  ]'::jsonb,
  updated_at = now()
where vertical_id = '00000000-0000-4000-8000-000000000102'
  and sheet_name in ('Orientation and ADP Set-up', 'Orientation and ADP Setup');

update public.vertical_report_templates
set
  columns = '[
    {"key":"driver_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Phone number","type":"phone"},
    {"key":"reminder_sent","label":"Sent Reminders","type":"date"},
    {"key":"day_1_attendance","label":"Day 1 Attendance","type":"present_dns"},
    {"key":"day_2_attendance","label":"Day 2 Attendance","type":"present_dns"},
    {"key":"training_status","label":"Training Status","type":"pass_fail_reschedule"},
    {"key":"ore_schedule","label":"Schedule for ORE (On the road evaluation)","type":"date"},
    {"key":"work_schedule_plotted","label":"Work Schedule Plotted","type":"dispatch_status"}
  ]'::jsonb,
  updated_at = now()
where vertical_id = '00000000-0000-4000-8000-000000000103'
  and sheet_name = 'Training, ORE, and Scheduling';
