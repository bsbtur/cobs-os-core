select cron.unschedule(jobid)
from cron.job
where jobname='cobs-participant-added-automation-dispatch-qa';