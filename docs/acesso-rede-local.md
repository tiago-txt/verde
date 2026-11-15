# Acesso pela rede local

Ao abrir o Verde por `http://orangepi3b:3200` (HTTP, sem TLS), Chrome/Edge podem
bloquear as requisições internas do Next.js com erros de **Private Network
Access / CORS**, principalmente ao navegar entre páginas ou após uma Server
Action:

```
Access to fetch at 'http://orangepi3b:3200/cartoes?_rsc=...' ... blocked by CORS policy:
The request client is not a secure context and the resource is in more-private address space `local`.
```

O middleware do Verde responde aos preflights com
`Access-Control-Allow-Private-Network: true` e libera CORS apenas para a mesma
origem, o que resolve a maior parte dos casos. Se o navegador continuar
bloqueando, use uma destas alternativas:

1. **Acessar por `http://localhost:3200`** na própria máquina ou por túnel SSH:
   ```bash
   ssh -L 3200:localhost:3200 usuario@orangepi3b
   ```
   Depois abra `http://localhost:3200`.
2. Colocar um proxy HTTPS na frente (Caddy, Traefik, Nginx + certificado).
3. Em último caso, para testes, desativar temporariamente a checagem em
   `chrome://flags` (Private Network Access / Local Network Access).

O importador em si roda no servidor. Se a importação terminou e só a navegação
falhou, os dados normalmente já foram gravados; recarregue a página usando uma
das opções acima.
