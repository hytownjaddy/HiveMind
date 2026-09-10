"""Helpers over the generated worker-protocol models (D-032, D-043).

The generated package is never edited; this module adds construction and
naming conveniences so providers and the agent speak the contract exactly.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import TypeAdapter

from hivemind_worker.contracts import (
    destroy_job,
    destroy_job_result,
    destroy_result,
    error_event,
    exec_job,
    exec_job_result,
    exec_result,
    fault_inject_job,
    fault_verify_job,
    grade_job,
    heartbeat,
    lab_node_config,
    lab_spec,
    lab_status,
    log_event,
    provision_job,
    provision_job_result,
    provision_result,
    reconcile_event,
    reconcile_expected,
    result_event,
    status_event,
    worker_envelope,
)

PROTOCOL_VERSION = 1

WorkerMessage = (
    provision_job.ProvisionJob
    | exec_job.ExecJob
    | fault_inject_job.FaultInjectJob
    | fault_verify_job.FaultVerifyJob
    | grade_job.GradeJob
    | destroy_job.DestroyJob
    | status_event.StatusEvent
    | log_event.LogEvent
    | result_event.ResultEvent
    | error_event.ErrorEvent
    | heartbeat.Heartbeat
    | reconcile_event.ReconcileEvent
    | reconcile_expected.ReconcileExpected
)

NodeConfig = lab_node_config.LabNodeConfig1 | lab_node_config.LabNodeConfig2
node_config_adapter: TypeAdapter[NodeConfig] = TypeAdapter(NodeConfig)
envelope_adapter: TypeAdapter[worker_envelope.WorkerEnvelope] = TypeAdapter(
    worker_envelope.WorkerEnvelope
)


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id() -> str:
    return str(uuid.uuid4())


def parse_envelope(payload: Any) -> worker_envelope.WorkerEnvelope:
    return envelope_adapter.validate_python(payload)


def envelope(
    message: Any, sender_id: str, correlation_id: str | None = None
) -> worker_envelope.WorkerEnvelope:
    return worker_envelope.WorkerEnvelope(
        protocol_version=1,
        message_id=new_id(),
        correlation_id=correlation_id,
        sent_at=now_iso(),
        sender=worker_envelope.Sender(kind=worker_envelope.Kind.lab_worker, id=sender_id),
        message=message,
    )


def dump(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json", by_alias=True, exclude_unset=True)


def node_config_of(node: lab_spec.Node) -> NodeConfig | None:
    """Parse a node's open config into the provider contract, or None when absent."""
    if node.config is None:
        return None
    return node_config_adapter.validate_python(node.config)


def status(session_id: str, value: str, detail: str | None = None) -> status_event.StatusEvent:
    return status_event.StatusEvent(
        type="event.status",
        lab_session_id=session_id,
        status=lab_status.LabStatus(value),
        at=now_iso(),
        detail=detail,
    )


def log(session_id: str, level: str, message: str) -> log_event.LogEvent:
    return log_event.LogEvent(
        type="event.log",
        lab_session_id=session_id,
        level=log_event.Level(level),
        message=message[:4000],
        at=now_iso(),
    )


def error(
    session_id: str | None, code: str, message: str, retryable: bool, job_id: str | None = None
) -> error_event.ErrorEvent:
    return error_event.ErrorEvent(
        type="event.error",
        job_id=job_id,
        lab_session_id=session_id,
        code=code,
        message=message[:2000],
        retryable=retryable,
    )


def provision_ok(
    job: provision_job.ProvisionJob, result: provision_result.ProvisionResult
) -> result_event.ResultEvent:
    return result_event.ResultEvent(
        type="event.result",
        job_id=job.job_id,
        lab_session_id=job.lab_session_id,
        ok=True,
        result=provision_job_result.ProvisionJobResult(kind="provision", result=result),
    )


def exec_ok(job: exec_job.ExecJob, result: exec_result.ExecResult) -> result_event.ResultEvent:
    return result_event.ResultEvent(
        type="event.result",
        job_id=job.job_id,
        lab_session_id=job.lab_session_id,
        ok=result.exit_code == 0 and not result.timed_out,
        result=exec_job_result.ExecJobResult(kind="exec", result=result),
    )


def destroy_ok(
    job: destroy_job.DestroyJob, result: destroy_result.DestroyResult
) -> result_event.ResultEvent:
    return result_event.ResultEvent(
        type="event.result",
        job_id=job.job_id,
        lab_session_id=job.lab_session_id,
        ok=result.destroyed,
        result=destroy_job_result.DestroyJobResult(kind="destroy", result=result),
    )
