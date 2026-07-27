-- VINE Pulse: DSP-scoped employee landing page and real vertical template mappings.
-- Apply after 20260725023000_initial_vine_pulse.sql.

create table public.vertical_report_templates (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.verticals(id) on delete cascade,
  sheet_name text not null,
  sheet_sequence integer not null default 1,
  source_filename text not null,
  columns jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vertical_id, sheet_name)
);

create index vertical_report_templates_vertical_idx
  on public.vertical_report_templates (vertical_id, sheet_sequence);

create trigger vertical_report_templates_updated_at
before update on public.vertical_report_templates
for each row execute function public.set_updated_at();

insert into public.vertical_report_templates (
  vertical_id,
  sheet_name,
  sheet_sequence,
  source_filename,
  columns
) values
(
  '00000000-0000-4000-8000-000000000101',
  'Sourcing and hiring',
  1,
  'Vertical 1 - Sourcing and Hiring.xlsx',
  '[
    {"key":"candidate_name","label":"Name from indeed or smart recruiter","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"phone number","type":"phone"},
    {"key":"activity_date","label":"Date","type":"date"},
    {"key":"interview_invite_sent","label":"Invite for Interview Sent","type":"yes_no"},
    {"key":"scheduled_interview","label":"Scheduled Interview","type":"date"},
    {"key":"interview_confirmed","label":"Confirm Interview","type":"yes_no"},
    {"key":"no_response","label":"No response","type":"yes_no"},
    {"key":"rescheduled","label":"Rescheduled","type":"date"},
    {"key":"interview_result","label":"Interview Result","type":"pass_fail"}
  ]'::jsonb
),
(
  '00000000-0000-4000-8000-000000000101',
  'Background check',
  2,
  'Vertical 1 - Sourcing and Hiring.xlsx',
  '[
    {"key":"candidate_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"phone number","type":"phone"},
    {"key":"background_check","label":"Background Check","type":"pass_fail"},
    {"key":"clinic_details_sent","label":"Clinic Details Sent","type":"yes_no"},
    {"key":"drug_test","label":"Drug Test","type":"pass_fail"}
  ]'::jsonb
),
(
  '00000000-0000-4000-8000-000000000102',
  'Orientation and ADP Set-up',
  1,
  'Vertical 2 - Orientation and ADP Set-up.xlsx',
  '[
    {"key":"candidate_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Number","type":"phone"},
    {"key":"docs_followup_sent","label":"Follow up message sent for Docs?","type":"yes_no"},
    {"key":"orientation_docs_sent","label":"Orientation Docs","type":"date"},
    {"key":"orientation_docs_completed","label":"Completed","type":"date"},
    {"key":"adp_section_1_sent","label":"ADP Section 1 Sent","type":"date"},
    {"key":"adp_section_1_completed","label":"Completed","type":"date"},
    {"key":"book_for_training","label":"Book For Training","type":"yes_no"},
    {"key":"scheduled_training","label":"Scheduled Training","type":"date"}
  ]'::jsonb
),
(
  '00000000-0000-4000-8000-000000000103',
  'Training, ORE, and Scheduling',
  1,
  'Vertical 3 - Training, ORE, and Scheduling.xlsx',
  '[
    {"key":"driver_name","label":"Name","type":"text"},
    {"key":"email","label":"Email","type":"email"},
    {"key":"phone_number","label":"Phone number","type":"phone"},
    {"key":"reminder_sent","label":"Sent Reminders","type":"date"},
    {"key":"day_1_attendance","label":"Day 1 Attendance","type":"present_dns"},
    {"key":"day_2_attendance","label":"Day 2 Attendance","type":"present_dns"},
    {"key":"training_status","label":"Training Status","type":"pass_fail_in_progress"},
    {"key":"ore_schedule","label":"Schedule for ORE (On the road evaluation)","type":"date"},
    {"key":"work_schedule_plotted","label":"Work Schedule Plotted","type":"dispatch_status"}
  ]'::jsonb
),
(
  '00000000-0000-4000-8000-000000000104',
  'Time and Attendance',
  1,
  'Vertical 4 - Time and Attendance.xlsx',
  '[
    {"key":"driver_name","label":"Name","type":"text"},
    {"key":"phone_number","label":"Phone number","type":"phone"},
    {"key":"cortex_app_in","label":"Cortex App In","type":"datetime"},
    {"key":"cortex_app_out","label":"Cortex App Out","type":"datetime"},
    {"key":"adp_clock_in","label":"ADP Clock in","type":"datetime"},
    {"key":"adp_clock_out","label":"ADP Clock Out","type":"datetime"},
    {"key":"total_break_time_used","label":"Total Break Time Used","type":"duration"},
    {"key":"sign_in_difference","label":"Sign in Difference","type":"minutes"},
    {"key":"sign_out_difference","label":"Sign Out Difference","type":"minutes"},
    {"key":"missed_punch_in","label":"Missed Punch In","type":"boolean"},
    {"key":"missed_punch_out","label":"Missed Punch Out","type":"boolean"},
    {"key":"missed_punch_in_followup","label":"Follow up for Missed punch In","type":"yes_no"},
    {"key":"missed_punch_in_status","label":"Status","type":"entered_pending_no_response"},
    {"key":"missed_punch_out_followup","label":"Follow up for Missed punch Out","type":"yes_no"},
    {"key":"missed_punch_out_status","label":"Status","type":"entered_pending_no_response"},
    {"key":"possible_time_theft","label":"Possible Time Theft","type":"low_moderate_high"},
    {"key":"sent_to_dispatch","label":"Sent To Dispatch","type":"yes_fixed_by_driver"}
  ]'::jsonb
)
on conflict (vertical_id, sheet_name) do update set
  sheet_sequence = excluded.sheet_sequence,
  source_filename = excluded.source_filename,
  columns = excluded.columns,
  active = true,
  updated_at = now();

alter table public.vertical_report_templates enable row level security;

create policy "Authenticated users read vertical report templates"
on public.vertical_report_templates for select to authenticated
using (active = true);

create policy "Admins manage vertical report templates"
on public.vertical_report_templates for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

grant select on public.vertical_report_templates to authenticated;
grant insert, update, delete on public.vertical_report_templates to authenticated;
grant all on public.vertical_report_templates to service_role;

