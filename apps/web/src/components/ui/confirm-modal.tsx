"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
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
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} backdrop="blur">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">{title}</ModalHeader>
            <ModalBody>
              <div className="text-sm text-default-500">{children}</div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose} disabled={isLoading}>
                {cancelLabel}
              </Button>
              <Button
                variant="primary"
                onPress={async () => {
                  await onConfirm();
                  onClose();
                }}
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
