// Public settings. The anon key is meant to be public: it can do NOTHING here. Every Club table has no grants for it,
// and every Club function checks that the caller is signed-in Club staff. Secrets never appear in this app.
export const SUPABASE_URL = 'https://nphyubfveznqisohemsc.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5waHl1YmZ2ZXpucWlzb2hlbXNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyOTQ2OTEsImV4cCI6MjEwOTg3MDY5MX0.QLUF1wsLC-qjNWFG5deYvt2MX50FkAQJP3uKQngopjI';
// Staff who sign in with an Employee ID (no @) get <id>@LOGIN_DOMAIN behind the scenes, same as the Staff Ops app.
export const LOGIN_DOMAIN = 'staff.layover.app';
export const VERSION = '20261123a';
export const TZ = 'Asia/Manila';
