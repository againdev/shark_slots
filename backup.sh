#!/bin/bash

set -e

mkdir -p $BACKUP_DIR

BACKUP_FILE="$BACKUP_DIR/backup_${PG_DATABASE}_$(date +%Y%m%d_%H%M%S).sql.gz"

echo "Starting backup of database: $PG_DATABASE to $BACKUP_FILE"

export PGPASSWORD=$PG_PASSWORD
pg_dump -h $PG_HOST -U $PG_USER -d $PG_DATABASE | gzip > $BACKUP_FILE

if [ $? -eq 0 ] && [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Backup successful: $BACKUP_FILE ($BACKUP_SIZE)"
    
    # Keep only the 3 most recent backups
    echo "🧹 Cleaning up old backups (keeping only 3 most recent)..."
    cd $BACKUP_DIR
    BACKUP_COUNT=$(ls -1 backup_${PG_DATABASE}_*.sql.gz 2>/dev/null | wc -l)
    
    if [ $BACKUP_COUNT -gt 3 ]; then
        # Sort by modification time (newest first) and delete all but the first 3
        ls -1t backup_${PG_DATABASE}_*.sql.gz | tail -n +4 | xargs -r rm -f
        DELETED_COUNT=$((BACKUP_COUNT - 3))
        echo "🗑️  Deleted $DELETED_COUNT old backup(s)"
    else
        echo "📊 No cleanup needed (only $BACKUP_COUNT backup(s) found)"
    fi
    
    echo "📂 Current backups (newest first):"
    ls -1t backup_${PG_DATABASE}_*.sql.gz 2>/dev/null | head -3 | while read file; do
        if [ -f "$file" ]; then
            SIZE=$(du -h "$file" | cut -f1)
            echo "  - $file ($SIZE)"
        fi
    done
else
    echo "❌ Backup failed!"
    exit 1
fi