# VINE Pulse Supabase setup

The migrations create the VINE Pulse multi-DSP data model, row-level security policies, four default verticals, the real report-template field mappings, and a private `client-reports` Storage bucket.

## Apply to a new project

1. Create a Supabase project.
2. Install and authenticate the Supabase CLI.
3. Link this repository to the project:
   `supabase link --project-ref YOUR_PROJECT_REF`
4. Preview the migration:
   `supabase db push --dry-run`
5. Apply it:
   `supabase db push`
6. Add the public project URL and publishable/anon key to the application environment.
7. Add the service-role key only as a server-side secret. Never prefix it with `NEXT_PUBLIC_`.

The sanitized `seed.sql` file is for local development or a disposable staging project only. Do not load it into production.

## First Super Admin

Create the first user in Supabase Auth, then set its `profiles.role` to `super_admin` in the SQL editor. All later users can be created from the VINE Pulse Super Admin workspace.

## File path convention

Employee uploads use:

`{client_id}/{vertical_id}/{report_date}/{report_id}/{filename}`

Storage is private. Files are delivered only through authenticated downloads or short-lived signed URLs.

## Migration order

For a new project, apply both migrations in filename order:

1. `20260725023000_initial_vine_pulse.sql`
2. `20260727090000_dsp_vertical_report_templates.sql`

The second migration stores the exact sheet and column mappings from the four approved vertical workbooks. Employees see only the DSPs assigned to them through `employee_client_assignments`; the existing client row-level-security policy enforces that restriction.
