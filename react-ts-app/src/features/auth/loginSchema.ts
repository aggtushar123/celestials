import { z } from 'zod/v4';

export const loginSchema = z.object({
  email: z.email("Please enter a valid email address"),
  // Matches revenact-backend's minimum (accounts/serializers.py).
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginFormData = z.infer<typeof loginSchema>;
