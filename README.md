# VINE Pulse

VINE Pulse is a role-based client reporting and operations portal for four daily-service verticals:

1. Sourcing & Hiring
2. Orientation & ADP Setup
3. Training, ORE & Work Scheduling
4. Time & Attendance

## Access roles

- **Super admin:** manages clients, users, employee assignments, and all reports.
- **Employee:** owns one vertical, searches or chooses an assigned DSP after login, and uploads reports only inside that active DSP workspace.
- **Client:** sees only their company dashboard, authorized detail rows, and exports.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase project URL and publishable/anon key.
3. Keep the service-role key server-side only.
4. Apply `supabase/migrations/20260725023000_initial_vine_pulse.sql`.
5. Run `npm install`, then `npm run dev`.

Without Supabase environment values, the site runs in demonstration mode so the interface can be reviewed.

## Data handling

Source uploads belong in the private Supabase Storage bucket named `client-reports`; operational client files must never be committed to GitHub. The expected path is:

`{client_id}/{vertical_id}/{report_date}/{report_id}/{filename}`

Row-level security limits every user to their authorized role, client, and vertical. Generated starter templates are in `public/templates/`.

The four approved operational workbooks are stored in `public/templates/verticals/`. Their exact sheet and column definitions are registered by the second Supabase migration so the extraction layer can validate uploads against the correct vertical.

## Daily reporting rule

The reporting timezone is Eastern Time. The employee deadline is 5:00 PM ET every business day, with the client dashboard retaining the latest 30 days.
