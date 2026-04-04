import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY ) {
  throw new Error("Missing Supabase ENV variables");
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);