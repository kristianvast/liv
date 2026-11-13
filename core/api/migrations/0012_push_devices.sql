CREATE TABLE push_devices (
  token text PRIMARY KEY NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform = 'android'),
  locale text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX push_devices_user_idx ON push_devices(user_id);
