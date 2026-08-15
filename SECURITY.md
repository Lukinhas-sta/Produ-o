# Política de Segurança

Este é um projeto público. Somente informações destinadas ao frontend podem ser versionadas.

## Nunca publicar

- senhas ou credenciais de contas;
- arquivos `.env`;
- chaves `service_role` ou secret keys do Supabase;
- senhas de banco de dados;
- tokens administrativos;
- backups contendo dados reais.

Chaves públicas/publishable usadas pelo navegador devem continuar protegidas por RLS, grants mínimos e validações no banco.

Se uma credencial privada for publicada por engano, ela deve ser revogada/rotacionada imediatamente e removida do histórico quando necessário.
