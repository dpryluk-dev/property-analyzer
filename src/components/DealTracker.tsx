'use client';

import { useState, useTransition } from 'react';
import { theme as C, fmt, stageColors, STAGES } from '@/lib/theme';
import { updateDealStage, addDealNote, updatePurchaseInfo } from '@/lib/actions';

interface DealTrackerProps {
  portfolio: any[];
  onUpdate: (updated: any[]) => void;
}

export function DealTracker({ portfolio, onUpdate }: DealTrackerProps) {
  if (!portfolio || portfolio.length === 0) {
    return (
      <div style={{
        padding: 48,
        textAlign: 'center',
        color: C.muted,
        fontSize: 15,
      }}>
        No properties yet. Analyze one to start tracking deals.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {portfolio.map((property) => (
        <DealCard key={property.id} property={property} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function DealCard({ property, onUpdate }: { property: any; onUpdate: (updated: any[]) => void }) {
  const [isPending, startTransition] = useTransition();
  const currentStage = property.dealStage || STAGES[0];
  const currentIndex = STAGES.indexOf(currentStage as typeof STAGES[number]);

  // Purchase info local state
  const [purchasePrice, setPurchasePrice] = useState<string>(
    String(property.purchasePrice || property.adjPrice || '')
  );
  const [closedDate, setClosedDate] = useState<string>(
    property.closedDate ? new Date(property.closedDate).toISOString().split('T')[0] : ''
  );

  // Note form local state
  const [noteText, setNoteText] = useState('');
  const [milestone, setMilestone] = useState(false);

  function handleStageChange(stage: string) {
    startTransition(async () => {
      const result = await updateDealStage(property.id, stage);
      onUpdate(result);
    });
  }

  function handleSavePurchaseInfo() {
    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price <= 0) return;
    startTransition(async () => {
      const result = await updatePurchaseInfo(property.id, price, closedDate || null);
      onUpdate(result);
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    startTransition(async () => {
      const result = await addDealNote(property.id, noteText.trim(), currentStage, milestone);
      onUpdate(result);
      setNoteText('');
      setMilestone(false);
    });
  }

  const stageColor = stageColors[currentStage] || C.dim;
  const dealNotes: any[] = property.dealNotes || [];

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 24,
      opacity: isPending ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <h3 style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 600,
          color: C.text,
        }}>
          {property.address}
        </h3>
        <span style={{
          display: 'inline-block',
          padding: '4px 14px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          background: stageColor + '22',
          color: stageColor,
        }}>
          {currentStage}
        </span>
      </div>

      {/* Stage selector */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 24,
      }}>
        {STAGES.map((stage, idx) => {
          const isActive = stage === currentStage;
          const isPast = idx < currentIndex;
          const color = stageColors[stage] || C.dim;

          return (
            <button
              key={stage}
              onClick={() => handleStageChange(stage)}
              disabled={isPending}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: 500,
                cursor: isPending ? 'not-allowed' : 'pointer',
                background: isActive ? color + '22' : 'transparent',
                color: isActive ? color : isPast ? C.muted : C.dim,
                transition: 'all 0.15s',
              }}
            >
              {isPast ? '\u2713 ' : ''}{stage}
            </button>
          );
        })}
      </div>

      {/* Purchase info (shown when Closed or later) */}
      {currentIndex >= 2 && (
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.muted,
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Purchase Info
          </div>
          <div style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4 }}>
                Purchase Price
              </label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.card,
                  color: C.text,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4 }}>
                Close Date
              </label>
              <input
                type="date"
                value={closedDate}
                onChange={(e) => setClosedDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.card,
                  color: C.text,
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark',
                }}
              />
            </div>
            <button
              onClick={handleSavePurchaseInfo}
              disabled={isPending}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: C.accent,
                color: C.white,
                fontSize: 13,
                fontWeight: 600,
                cursor: isPending ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Notes timeline */}
      {dealNotes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.muted,
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Notes
          </div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: 7,
              top: 4,
              bottom: 4,
              width: 2,
              background: C.border,
              borderRadius: 1,
            }} />

            {dealNotes.map((note: any, i: number) => {
              const isMilestone = note.milestone;
              const noteStageColor = stageColors[note.stage] || C.dim;

              return (
                <div key={note.id || i} style={{
                  position: 'relative',
                  marginBottom: i < dealNotes.length - 1 ? 16 : 0,
                }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute',
                    left: isMilestone ? -22 : -20,
                    top: 2,
                    width: isMilestone ? 16 : 12,
                    height: isMilestone ? 16 : 12,
                    borderRadius: '50%',
                    background: isMilestone ? C.accent + '33' : C.border,
                    border: isMilestone ? `2px solid ${C.accent}` : `2px solid ${C.surface}`,
                    boxSizing: 'border-box',
                  }} />

                  {/* Content */}
                  <div style={{ paddingLeft: 8 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontSize: 11, color: C.dim }}>
                        {new Date(note.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span style={{
                        display: 'inline-block',
                        padding: '1px 8px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: noteStageColor + '22',
                        color: noteStageColor,
                      }}>
                        {note.stage}
                      </span>
                    </div>
                    <p style={{
                      margin: 0,
                      fontSize: 13,
                      color: C.text,
                      lineHeight: 1.5,
                    }}>
                      {note.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add note form */}
      <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Add a note..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && noteText.trim()) handleAddNote();
          }}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '8px 12px',
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.surface,
            color: C.text,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: C.muted,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
          <input
            type="checkbox"
            checked={milestone}
            onChange={(e) => setMilestone(e.target.checked)}
            style={{ accentColor: C.accent }}
          />
          Milestone
        </label>
        <button
          onClick={handleAddNote}
          disabled={isPending || !noteText.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: noteText.trim() ? C.accent : C.border,
            color: noteText.trim() ? C.white : C.dim,
            fontSize: 13,
            fontWeight: 600,
            cursor: isPending || !noteText.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s',
          }}
        >
          Add Note
        </button>
      </div>
    </div>
  );
}
