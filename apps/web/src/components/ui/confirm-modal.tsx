"use client";

import { useCallback } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Button } from "./button";

interface ConfirmModalProps {
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isOpen,
  onOpenChange,
  isLoading,
}: ConfirmModalProps) {
  const focusCancel = useCallback((button: HTMLButtonElement | null) => button?.focus(), []);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      backdrop="blur"
      scrollBehavior="inside"
      isDismissable={!isLoading}
      isKeyboardDismissDisabled={isLoading}
      hideCloseButton={isLoading}
    >
      <ModalContent>
        {(onClose: () => void) => (
          <>
            <ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
            <ModalBody>
              <div className="text-sm text-default-500">{children}</div>
            </ModalBody>
            <ModalFooter>
              <Button ref={focusCancel} variant="ghost" onPress={onClose} disabled={isLoading}>
                {cancelLabel}
              </Button>
              <Button
                variant="primary"
                onPress={onConfirm}
                isLoading={isLoading}
                className="bg-danger text-white"
              >
                {confirmLabel}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
