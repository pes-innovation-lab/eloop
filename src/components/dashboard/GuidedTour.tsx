"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from 'next/navigation';

type Step = {
    selector: string; // CSS selector to find element
    title: string;
    body: string;
    href?: string; // optional navigation target when the selector lives on another page
};

export default function GuidedTour({ open, onClose }: { open: boolean; onClose: () => void }) {
    const steps: Step[] = [
        // 1. What is eloop?
        { selector: 'body', title: 'What is eloop?', body: 'Overview of features and best practices for smooth, fun events! \n Built by HSP: https://hsp-ec.xyz/eloop' },

        // 2. What it solves (cost & queues)
        { selector: 'body', title: 'What it solves', body: 'Reduces costs and friction. Capture choices at signup, track registrations vs. no-shows to avoid waste and shortages.' },

        // 3. Admin role
        { selector: 'body', title: 'Admin role', body: 'Admins set up organizers. The admin is typically a member of your organization\'s tech team who deployed this eloop instance. \n Visit: https://github.com/homebrew-ec-foss/eloop' },

        // 4. User roles
        { selector: 'body', title: 'User roles', body: '• Organizers: Create events, approve regs (can edit/delete events only if no registrations exist)\n• Applicants: register.\n• Participants: approved applicants by organizers.\n• Volunteers: Scan QRs.\n• Mentors: Scan QRs to grade teams on each round.' },

        // 5. End-to-end workflow
        { selector: 'body', title: 'End-to-end is important', body: 'Keep entire lifecycle in eloop to minimize operational headache. Only collect registrations in eloop as primary record, do not send out other Google forms!' },

        // 6. Payments (workflow) - explicit: register first, no extra collection
        { selector: 'body', title: 'Payments & approvals', body: 'For paid events: Have participants register on eloop first. \n The dashboard tracks pending applicants. Use any verification method (like a Google Form) to collect payment proofs, but don\'t ask for additional details beyond what\'s needed. Eloop remains the master record for registrations.' },

        // 7. My events
        { selector: '[data-tour="stats-my-events"]', title: 'My events', body: 'Here you can see your events overview with metrics and follow-up cards once you create events.', href: '/dashboard/events' },
    ];

    const [index, setIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

    // Tooltip positioning & drag state
    const [tooltipPos, setTooltipPos] = useState<{ left?: number; top?: number } | null>(null);
    const [manualPosition, setManualPosition] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const startPosRef = useRef<{ left: number; top: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    const router = useRouter();
    const lastNavigatedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open) return;

        async function updateRect() {
            const step = steps[index];
            const el = document.querySelector(step.selector) as HTMLElement | null;

            // If the element isn't present but the step has an href, navigate there
            if (!el && step.href && window.location.pathname !== step.href && lastNavigatedRef.current !== step.href) {
                lastNavigatedRef.current = step.href;
                try {
                    await router.push(step.href);
                    // allow time for the new page to render before measuring
                    setTimeout(() => {
                        const el2 = document.querySelector(step.selector) as HTMLElement | null;
                        if (el2) {
                            setTargetRect(el2.getBoundingClientRect());
                            el2.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } else {
                            setTargetRect(null);
                        }
                    }, 250);
                } catch (err) {
                    console.error('Failed to navigate for guided tour:', err);
                }
                return;
            }

            if (el) {
                setTargetRect(el.getBoundingClientRect());
                // ensure the element is visible
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                setTargetRect(null);
            }
        }

        updateRect();
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);
        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
        };
    }, [open, index, router]);

    useEffect(() => {
        if (!open) setIndex(0);
    }, [open]);

    // Safety: if the site shows this organizer already has events, close the tour immediately
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const res = await fetch('/api/dashboard/stats');
                if (!res.ok) return;
                const data = await res.json();
                const events = Number(data.events || 0);
                if (events !== 0) {
                    // close the tour if events exist
                    onClose();
                }
            } catch (err) {
                // ignore errors - don't block the tour if stats fail
                console.warn('GuidedTour: failed to check stats', err);
            }
        })();
    }, [open, onClose]);

    // reset tooltip position when step/target changes, unless user moved it
    useEffect(() => {
        if (!open) return;
        if (manualPosition) return;

        const tooltipWidth = tooltipRef.current?.offsetWidth ?? Math.min(480, Math.floor(window.innerWidth * 0.6));
        const tooltipHeight = tooltipRef.current?.offsetHeight ?? 180;

        if (targetRect) {
            const rect = targetRect;
            let left, top;

            // Special positioning for create event button - place below the button
            if (step.selector === '[data-tour="create-event"]') {
                // Center horizontally on the button
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2) + window.scrollX;
                // Place below the button
                top = rect.bottom + 12 + window.scrollY;
                // If not enough space below, place above
                if (top + tooltipHeight > window.scrollY + window.innerHeight) {
                    top = rect.top - tooltipHeight - 12 + window.scrollY;
                }
            } else {
                // Default positioning logic for other steps
                // try to place tooltip to the right of the target
                left = rect.right + 12 + window.scrollX;
                // if it would overflow right viewport, put it to the left of the target
                if (left + tooltipWidth + 8 > window.scrollX + window.innerWidth) {
                    left = rect.left - tooltipWidth - 12 + window.scrollX;
                }
                // clamp to viewport edges
                left = Math.min(Math.max(8 + window.scrollX, left), window.scrollX + window.innerWidth - tooltipWidth - 8);

                // choose top: prefer above if enough space, otherwise below
                top = rect.top + window.scrollY - 120;
                if (top < 8 + window.scrollY) top = rect.bottom + 12 + window.scrollY;
            }

            top = Math.min(Math.max(8 + window.scrollY, top), window.scrollY + window.innerHeight - tooltipHeight - 8);
            left = Math.min(Math.max(8 + window.scrollX, left), window.scrollX + window.innerWidth - tooltipWidth - 8);

            setTooltipPos({ left, top });
        } else {
            // center the tooltip in available viewport space
            const left = Math.min(Math.max(8 + window.scrollX, Math.round(window.scrollX + (window.innerWidth - tooltipWidth) / 2)), window.scrollX + window.innerWidth - tooltipWidth - 8);
            const top = Math.min(Math.max(8 + window.scrollY, Math.round(window.scrollY + (window.innerHeight - tooltipHeight) / 2)), window.scrollY + window.innerHeight - tooltipHeight - 8);
            setTooltipPos({ left, top });
        }
    }, [open, index, targetRect, manualPosition]);

    // Pointer handlers for dragging the tooltip
    function handlePointerDown(e: React.PointerEvent) {
        const targetEl = e.target as HTMLElement | null;
        // If the pointerdown started on an interactive element, don't start a drag so clicks still work
        if (targetEl && targetEl.closest && targetEl.closest('button, a, input, textarea, select, [role="button"]')) {
            return;
        }

        const rect = tooltipRef.current?.getBoundingClientRect();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        startPosRef.current = { left: rect?.left ?? (tooltipPos?.left ?? window.innerWidth / 2), top: rect?.top ?? (tooltipPos?.top ?? 120) };
    }

    function handlePointerMove(e: React.PointerEvent) {
        if (!dragging || !dragStartRef.current || !startPosRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        let newLeft = startPosRef.current.left + dx;
        let newTop = startPosRef.current.top + dy;
        const w = tooltipRef.current?.offsetWidth ?? 400;
        const h = tooltipRef.current?.offsetHeight ?? 160;
        // constrain within viewport (page coordinates with scroll offsets)
        newLeft = Math.min(Math.max(8 + window.scrollX, newLeft), window.scrollX + window.innerWidth - w - 8);
        newTop = Math.min(Math.max(8 + window.scrollY, newTop), window.scrollY + window.innerHeight - h - 8);
        setTooltipPos({ left: newLeft, top: newTop });
        setManualPosition(true);
    }

    function handlePointerUp(e: React.PointerEvent) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        setDragging(false);
        dragStartRef.current = null;
        startPosRef.current = null;
    }

    function handlePointerCancel(e: React.PointerEvent) {
        handlePointerUp(e);
    }



    if (!open) return null;

    const step = steps[index];

    function renderBody(body: string) {
        const urlRegex = /(https:\/\/[^\s]+)/g;
        const parts = body.split(urlRegex);
        return parts.map((part, index) => {
            if (part.match(urlRegex)) {
                return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{part}</a>;
            }
            return part;
        });
    }

    function next() {
        if (index < steps.length - 1) setIndex(i => i + 1);
        else finish();
    }

    function prev() {
        if (index > 0) setIndex(i => i - 1);
    }

    async function finish() {
        // Navigate to the events list (ensure users end up on My Events), then close the tour
        try {
            await router.push('/dashboard/events');
        } catch (err) {
            console.warn('GuidedTour: navigation to /dashboard/events failed', err);
        }
        onClose();
    }

    // compute tooltip position (use manual tooltipPos if user dragged it)
    const tooltipStyle: React.CSSProperties = { position: 'absolute' };
    if (tooltipPos) {
        tooltipStyle.left = tooltipPos.left;
        tooltipStyle.top = tooltipPos.top;
    } else if (targetRect) {
        const left = Math.min(window.innerWidth - 24 - 400, targetRect.right + 12 + window.scrollX);
        const topCalc = Math.max(12, targetRect.top + window.scrollY - 120);
        const top = topCalc < 200 ? (targetRect.bottom + 12 + window.scrollY) : topCalc;
        tooltipStyle.left = left;
        tooltipStyle.top = top;
    } else {
        tooltipStyle.left = window.innerWidth / 2;
        tooltipStyle.transform = 'translateX(-50%)';
        tooltipStyle.top = 120;
    }

    return (
        <div aria-hidden={!open} className="fixed inset-0 z-[9999] pointer-events-none">
            {/* dim overlay */}
            {/* Dim overlay without blur so highlighted element remains visible */}
            <div className="absolute inset-0 bg-black/40" style={{ pointerEvents: 'auto' }} onClick={finish}></div>

            {/* highlight box */}
            {targetRect && (
                <div style={{ position: 'absolute', left: targetRect.left + window.scrollX - 6, top: targetRect.top + window.scrollY - 6, width: targetRect.width + 12, height: targetRect.height + 12, borderRadius: 12, boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.12)', border: '2px solid rgba(99, 102, 241, 0.9)', pointerEvents: 'none', zIndex: 10000 }} />
            )}

            {/* tooltip */}
            <div ref={tooltipRef} tabIndex={0} style={{ ...tooltipStyle, cursor: dragging ? 'grabbing' : 'grab' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} className="pointer-events-auto z-[10001] max-w-xl w-[min(90%,48rem)]">
                <div className="bg-white rounded-2xl shadow-lg p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm text-slate-500 uppercase">Step {index + 1} of {steps.length}</p>
                            <h3 className="text-lg font-semibold text-slate-900 mt-1">{step.title}</h3>
                            <p className="text-xs text-slate-400 mt-1">Tip: drag this box to reposition</p>
                            <div className="text-sm text-slate-600 mt-2">
                                {step.body.split('\n').map((line, i) => <div key={i}>{renderBody(line)}</div>)}
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <button onClick={finish} className="text-sm text-slate-500">Dismiss</button>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                        <button onClick={prev} disabled={index === 0} className="px-3 py-1 rounded border border-slate-200 text-sm disabled:opacity-50">Back</button>
                        <button onClick={next} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm ml-auto">{index === steps.length - 1 ? 'Finish' : 'Next'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
