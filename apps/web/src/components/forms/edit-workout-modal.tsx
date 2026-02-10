"use client";

import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import type { TrainingEntry } from "@rowbook/shared";

import { EditWorkoutForm } from "@/components/forms/edit-workout-form";

type EditWorkoutModalProps = {
  entry: TrainingEntry | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function EditWorkoutModal({ entry, isOpen, onOpenChange }: EditWorkoutModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      backdrop="blur"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Edit workout</ModalHeader>
            <ModalBody className="pb-5">
              {entry ? (
                <EditWorkoutForm
                  entry={entry}
                  onSuccess={onClose}
                  onCancel={onClose}
                />
              ) : null}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

