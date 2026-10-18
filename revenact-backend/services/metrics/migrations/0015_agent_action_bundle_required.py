import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0003_bundles_of_one"),
        ("metrics", "0014_agent_action_steps"),
    ]

    operations = [
        migrations.AlterField(
            model_name="agentaction",
            name="bundle",
            field=models.ForeignKey(
                help_text="The bundle this step belongs to; a lone action is a bundle of one.",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="steps",
                to="agents.agentbundle",
            ),
        ),
        migrations.AddConstraint(
            model_name="agentaction",
            constraint=models.UniqueConstraint(
                fields=("bundle", "position"), name="agent_action_bundle_position"
            ),
        ),
    ]
