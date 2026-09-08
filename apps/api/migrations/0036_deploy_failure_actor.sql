-- WHO caused a deploy failure: signed-in user email, anonymous deployer hash,
-- or synthetic source ('smoke' / 'test'). Lets ops tell a real user from our
-- own smoke suite at a glance. Never stores a raw IP.

ALTER TABLE deploy_failures ADD COLUMN actor TEXT;
