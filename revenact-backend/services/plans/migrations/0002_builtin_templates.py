from django.db import migrations

from services.plans.builtins import seed_builtins


def forwards(apps, schema_editor):
    seed_builtins(apps.get_model("plans", "PlanTemplate"))


def backwards(apps, schema_editor):
    apps.get_model("plans", "PlanTemplate").objects.filter(is_builtin=True).delete()


class Migration(migrations.Migration):
    dependencies = [("plans", "0001_initial")]

    operations = [migrations.RunPython(forwards, backwards)]
