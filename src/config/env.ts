import dotenv from 'dotenv';

dotenv.config();

export const env = {
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5',
  port: Number(process.env.PORT ?? 4000),
  cpanelUploadDeleteUrl:
    process.env.CPANEL_UPLOAD_DELETE_URL ??
    'https://api.squashcode-studio.7sc.in/upload_delete.php',
  cpanelSupportingUploadUrl:
    process.env.CPANEL_SUPPORTING_UPLOAD_URL ??
    'https://api.squashcode-studio.7sc.in/upload_supporting.php',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
};
