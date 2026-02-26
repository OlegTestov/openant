#!/bin/sh
# Fake sendmail that silently discards all email.
# Reads stdin to avoid EPIPE and exits 0.
cat > /dev/null
exit 0
