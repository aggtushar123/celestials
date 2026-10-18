import django.db.models.deletion
import pgvector.django
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("copilot", "0019_modelcall_scope_key"),
    ]

    operations = [
        # Cloud SQL for PostgreSQL ships pgvector; the app user can create it.
        pgvector.django.VectorExtension(),
        migrations.CreateModel(
            name="TextEmbedding",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("model", models.CharField(max_length=64)),
                ("text_hash", models.CharField(max_length=64)),
                ("vector", pgvector.django.VectorField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "organisation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="accounts.organisation",
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("organisation", "model", "text_hash"), name="unique_text_embedding"
                    )
                ],
            },
        ),
    ]
