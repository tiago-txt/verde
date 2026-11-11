import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(200, "A senha é muito longa.")
  .regex(/[A-Za-zÀ-ÿ]/, "A senha deve conter pelo menos uma letra.")
  .regex(/[0-9]/, "A senha deve conter pelo menos um número.");

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail inválido")
  .max(200);

export const userRoleSchema = z.enum(["admin", "membro"]);

export const createUserSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  email: emailField,
  senha: passwordSchema.optional(),
  role: userRoleSchema.default("membro"),
});

export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateProfileSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  email: emailField,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual.").max(200),
  novaSenha: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  senha: z.string().min(1, "Informe sua senha para confirmar.").max(200),
  confirmacao: z
    .string()
    .trim()
    .refine((value) => value === "EXCLUIR", {
      message: "Digite EXCLUIR para confirmar.",
    }),
});

export type DeleteAccountInput = { senha: string; confirmacao: string };

export const signupSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  email: emailField,
  senha: passwordSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
