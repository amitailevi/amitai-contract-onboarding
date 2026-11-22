#!/bin/zsh
# Saves the Anthropic API key locally (chat/.env, not committed). The key is never printed.
cd "${0:A:h}"
print -n "הדבק את המפתח ולחץ Enter (לא יוצג על המסך): "; read -rs K; print
[[ $K == sk-ant-* ]] || { print "❌ זה לא נראה כמו מפתח (מתחיל ב-sk-ant-)"; exit 1; }
umask 077; print "ANTHROPIC_API_KEY=$K" > .env; print "✅ המפתח נשמר. אפשר לחזור לצ'אט."
