"""Faz uma consulta leve ao banco para o plano gratuito do Supabase não pausar o projeto
(ele pausa após 7 dias sem requisições). Rodar a cada 2 dias (Agendador de Tarefas do Windows ou manual).
Usa só a chave anon (pública) do .env.
"""
import pathlib, urllib.request
env = dict(l.split("=", 1) for l in (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text().splitlines() if "=" in l)
url = env["VITE_SUPABASE_URL"].strip() + "/rest/v1/formularios?select=id&limit=1"
req = urllib.request.Request(url, headers={"apikey": env["VITE_SUPABASE_ANON_KEY"].strip(), "Authorization": "Bearer " + env["VITE_SUPABASE_ANON_KEY"].strip()})
try:
    r = urllib.request.urlopen(req, timeout=30)
    print("banco acordado:", r.status)
except Exception as e:
    print("falhou:", e)
