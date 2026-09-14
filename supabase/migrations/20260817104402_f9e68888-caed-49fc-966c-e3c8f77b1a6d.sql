
CREATE TABLE public.hosted_batches (
  id text PRIMARY KEY,
  name text NOT NULL,
  joining_date text,
  project text,
  location text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_batches TO service_role;
ALTER TABLE public.hosted_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_candidates (
  id text PRIMARY KEY,
  candidate_id text NOT NULL,
  batch_id text NOT NULL REFERENCES public.hosted_batches(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  joining_date text,
  location text,
  verification_link text,
  verification_status text NOT NULL DEFAULT 'NOT_STARTED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_candidates TO service_role;
ALTER TABLE public.hosted_candidates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'WELCOME',
  subject text NOT NULL,
  body text NOT NULL,
  active integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_templates TO service_role;
ALTER TABLE public.hosted_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_communications (
  id text PRIMARY KEY,
  candidate_id text,
  batch_id text,
  template_id text,
  template_name text,
  type text NOT NULL DEFAULT 'WELCOME',
  recipient text NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'QUEUED',
  attempts integer NOT NULL DEFAULT 0,
  environment text NOT NULL DEFAULT 'LOVABLE_HOSTED',
  provider text NOT NULL DEFAULT 'resend',
  first_name text,
  last_name text,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_communications TO service_role;
ALTER TABLE public.hosted_communications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_reminders (
  id text PRIMARY KEY,
  name text NOT NULL,
  batch_id text,
  batch_name text,
  template_id text,
  template_name text,
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  target_condition text NOT NULL DEFAULT 'NOT_STARTED',
  status text NOT NULL DEFAULT 'SCHEDULED',
  attempted integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_reminders TO service_role;
ALTER TABLE public.hosted_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_logs (
  id text PRIMARY KEY,
  level text NOT NULL DEFAULT 'INFO',
  source text NOT NULL DEFAULT 'SYSTEM',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_logs TO service_role;
ALTER TABLE public.hosted_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hosted_settings (
  id integer PRIMARY KEY DEFAULT 1,
  live_mode boolean NOT NULL DEFAULT false,
  sender_email text NOT NULL DEFAULT 'trimankaur1905@gmail.com',
  sender_name text NOT NULL DEFAULT 'ABC Recruitment',
  test_recipient text NOT NULL DEFAULT 'tkkaur1905@gmail.com',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hosted_settings TO service_role;
ALTER TABLE public.hosted_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.hosted_settings (id) VALUES (1);

INSERT INTO public.hosted_templates (id, name, category, subject, body) VALUES
('tpl-welcome', 'ABC Welcome Email', 'WELCOME', 'Welcome to the ABC Onboarding Process',
'Hi {{first_name}},

Welcome to the ABC onboarding process.

We are excited to have you join us.

Please complete the required onboarding steps using the link below:

{{verification_link}}

Joining Date:
{{joining_date}}

Please complete the required steps within the specified timeline.

Regards,
ABC Recruitment Team'),
('tpl-reminder', 'Verification Reminder Email', 'REMINDER', 'Reminder: Complete your ABC verification',
'Hi {{first_name}},

This is a reminder to complete your onboarding verification for your joining date on {{joining_date}}.

Please use the link below to complete the pending steps:

{{verification_link}}

Regards,
ABC Recruitment Team');
