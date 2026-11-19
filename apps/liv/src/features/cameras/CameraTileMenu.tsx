import type { Camera as CameraRow } from "@liv/schema";
import { Building2, Check, Edit3, Lock, MessageSquare, Plus } from "lucide-react";
import { useT } from "../../i18n";

export interface CameraTileMenuProps {
  readonly camera: CameraRow;
  readonly currentBarn: string;
  readonly availableBarns: readonly string[];
  readonly onClose: () => void;
  readonly onEditCamera: (camera: CameraRow) => void;
  readonly onAskLiv: (camera: CameraRow) => void;
  readonly onMoveToBarn: (camera: CameraRow, barn: string) => void;
  readonly onRequestNewBarn: (camera: CameraRow) => void;
}

export function CameraTileMenu({
  camera,
  currentBarn,
  availableBarns,
  onClose,
  onEditCamera,
  onAskLiv,
  onMoveToBarn,
  onRequestNewBarn,
}: CameraTileMenuProps) {
  const t = useT();

  return (
    <div
      role="menu"
      data-no-drag
      data-testid={`camera-tile-menu-popover-${camera.id}`}
      className="liv-camera-tile__menu"
    >
      <div className="liv-camera-tile__menu-head">
        <span className="liv-camera-tile__menu-title">{camera.name}</span>
        <span className="liv-camera-tile__menu-sub">
          <Lock size={12} />
          {camera.credentialRef
            ? t("cameras.card.passwordStored")
            : t("cameras.card.passwordMissing")}
        </span>
      </div>

      <button
        type="button"
        role="menuitem"
        data-testid={`camera-edit-${camera.id}`}
        className="liv-camera-tile__menu-item"
        onClick={() => {
          onClose();
          onEditCamera(camera);
        }}
      >
        <Edit3 size={14} />
        <span>{t("cameras.card.edit")}</span>
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid={`camera-ask-liv-${camera.id}`}
        className="liv-camera-tile__menu-item"
        onClick={() => {
          onClose();
          onAskLiv(camera);
        }}
      >
        <MessageSquare size={14} />
        <span>{t("cameras.card.askLiv")}</span>
      </button>

      <div className="liv-camera-tile__menu-divider" />
      <div className="liv-camera-tile__menu-section">
        <Building2 size={13} />
        <span>{t("cameras.tile.moveToBarn")}</span>
      </div>

      {availableBarns.map((barn) => {
        const isCurrent = barn === currentBarn;
        const label = barn === "" ? t("cameras.barn.ungrouped") : barn;
        const slug = barn || "ungrouped";
        return (
          <button
            key={slug}
            type="button"
            role="menuitemradio"
            aria-checked={isCurrent}
            data-testid={`camera-move-barn-${camera.id}-${slug}`}
            className="liv-camera-tile__menu-item"
            onClick={() => {
              onClose();
              if (!isCurrent) onMoveToBarn(camera, barn);
            }}
          >
            <Check size={14} style={{ visibility: isCurrent ? "visible" : "hidden" }} />
            <span>{label}</span>
          </button>
        );
      })}

      <button
        type="button"
        role="menuitem"
        data-testid={`camera-new-barn-${camera.id}`}
        className="liv-camera-tile__menu-item"
        onClick={() => {
          onClose();
          onRequestNewBarn(camera);
        }}
      >
        <Plus size={14} />
        <span>{t("cameras.barn.new")}</span>
      </button>
    </div>
  );
}
