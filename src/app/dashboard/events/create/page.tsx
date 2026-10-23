'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FormBuilder } from '@/components/forms/FormBuilder';
import { FormField } from '@/types';
import { RenderFormField, validateField } from '@/components/forms/FieldRenderer';

export default function CreateEventPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [previewFormValues, setPreviewFormValues] = useState<Record<string, string>>({});
  const [previewValidationErrors, setPreviewValidationErrors] = useState<Record<string, string>>({});
  const [previewDrivePublicConfirmed, setPreviewDrivePublicConfirmed] = useState<Record<string, boolean>>({});
  const [dateErrors, setDateErrors] = useState<{
    startDate?: string;
    endDate?: string;
    registrationCloseDate?: string;
  }>({});

  // Authorization check - redirect if not admin or organizer
  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/signin?callbackUrl=/dashboard/events/create');
      return;
    }

    if (session.user?.role !== 'admin' && session.user?.role !== 'organizer') {
      router.push('/dashboard');
    }
  }, [session, status, router]);

  // Check for edit parameter - redirect to events page since editing is disabled
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId) {
      // Redirect to events page since editing is disabled
      router.push('/dashboard/events');
    }
  }, [searchParams, router]);

  const [eventData, setEventData] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    registrationCloseDate: '',
    location: '',
    imageUrl: '',
    checkpoints: ['Checkin'],
  });

  const [newCheckpoint, setNewCheckpoint] = useState('');

  const handleFieldsChange = (updatedFields: FormField[]) => {
    setFormFields(updatedFields);
  };

  const getDuplicateFieldNames = (fList: FormField[]) => {
    const counts: Record<string, number> = {};
    fList.forEach(f => {
      const n = (f.name || '').trim();
      if (!n) return;
      counts[n] = (counts[n] || 0) + 1;
    });
    return Object.keys(counts).filter(n => counts[n] > 1);
  };

  const duplicateFieldNames = getDuplicateFieldNames(formFields);
  const hasDuplicateFieldNames = duplicateFieldNames.length > 0;

  // Initialize preview form values when form fields change
  useEffect(() => {
    const vals: Record<string, string> = {};
    const driveConfirmed: Record<string, boolean> = {};
    formFields.forEach(f => {
      if (f.useUserProfile && f.userProfileField === 'email') vals[f.name] = 'user@example.com';
      else if (f.useUserProfile && f.userProfileField === 'name') vals[f.name] = 'User Name';
      else vals[f.name] = '';
      driveConfirmed[f.name] = false;
    });
    setPreviewFormValues(vals);
    setPreviewValidationErrors({});
    setPreviewDrivePublicConfirmed(driveConfirmed);
  }, [formFields]);

  const handlePreviewInputChange = (fieldName: string, value: string) => {
    setPreviewFormValues(prev => ({ ...prev, [fieldName]: value }));

    // Clear preview validation error for this field when user types
    setPreviewValidationErrors(prev => {
      const copy = { ...prev };
      delete copy[fieldName];
      return copy;
    });

    const field = formFields.find(f => f.name === fieldName);
    if (field) {
      const err = validateField(field, value);
      if (err) setPreviewValidationErrors(prev => ({ ...prev, [fieldName]: err }));
    }
  };

  const isPreviewValid = () => {
    // required fields must be non-empty (user-profile fields considered filled)
    for (const f of formFields) {
      if (f.required) {
        const val = previewFormValues[f.name] ?? '';
        const filled = f.useUserProfile ? true : String(val).trim() !== '';
        if (!filled) return false;
      }
    }
    return Object.keys(previewValidationErrors).length === 0;
  };

  // Export entire event template as JSON (including all event data and form fields)
  const handleExportForm = () => {
    const exportData = {
      eventData: {
        name: eventData.name,
        description: eventData.description,
        startDate: eventData.startDate,
        endDate: eventData.endDate,
        registrationCloseDate: eventData.registrationCloseDate,
        location: eventData.location,
        imageUrl: eventData.imageUrl,
        checkpoints: eventData.checkpoints,
      },
      formFields: formFields,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = eventData.name
      ? `${eventData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_template.json`
      : `event-template-${new Date().toISOString().split('T')[0]}.json`;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Import entire event template from JSON
  const handleImportForm = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);

        // Validate structure
        if (!importedData.eventData || !importedData.formFields) {
          alert('Invalid template format. Expected eventData and formFields properties.');
          return;
        }

        // Import event data (including dates)
        if (importedData.eventData) {
          setEventData((prev) => ({
            ...prev,
            name: importedData.eventData.name || '',
            description: importedData.eventData.description || '',
            startDate: importedData.eventData.startDate || '',
            endDate: importedData.eventData.endDate || '',
            registrationCloseDate: importedData.eventData.registrationCloseDate || '',
            location: importedData.eventData.location || '',
            imageUrl: importedData.eventData.imageUrl || '',
            checkpoints: importedData.eventData.checkpoints || ['Checkin'],
          }));
        }

        // Import form fields with new UUIDs
        if (Array.isArray(importedData.formFields)) {
          const normalizedFields = importedData.formFields.map((field: FormField, index: number) => ({
            ...field,
            id: crypto.randomUUID(),
            order: index,
          }));
          setFormFields(normalizedFields);
        }

        alert(`Successfully imported event template!\n- Event info loaded\n- Event dates loaded\n- ${importedData.formFields.length} form fields loaded`);
      } catch (error) {
        console.error('Error parsing JSON:', error);
        alert('Failed to import template. Please ensure the file is a valid JSON format.');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be imported again if needed
    event.target.value = '';
  };

  const handleEventDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEventData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error for this field when user makes changes
    if (dateErrors[name as keyof typeof dateErrors]) {
      setDateErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  // Calculate event duration in hours
  const calculateDuration = (): number | null => {
    if (!eventData.startDate || !eventData.endDate) return null;

    const start = new Date(eventData.startDate);
    const end = new Date(eventData.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    if (end <= start) return null;

    const durationMs = end.getTime() - start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    return Math.round(durationHours * 10) / 10; // Round to 1 decimal place
  };

  // Validate dates
  const validateDates = (): boolean => {
    const errors: typeof dateErrors = {};
    const now = new Date();

    if (!eventData.startDate) {
      errors.startDate = 'Event start date is required';
    } else {
      const startDate = new Date(eventData.startDate);

      if (isNaN(startDate.getTime())) {
        errors.startDate = 'Invalid date format';
      } else if (startDate < now) {
        errors.startDate = 'Event start date cannot be in the past';
      }
    }

    if (eventData.endDate) {
      const endDate = new Date(eventData.endDate);
      const startDate = new Date(eventData.startDate);

      if (isNaN(endDate.getTime())) {
        errors.endDate = 'Invalid date format';
      } else if (endDate <= startDate) {
        errors.endDate = 'End date must be after start date';
      } else if (endDate < now) {
        errors.endDate = 'Event end date cannot be in the past';
      }
    }

    if (eventData.registrationCloseDate) {
      const regCloseDate = new Date(eventData.registrationCloseDate);
      const startDate = new Date(eventData.startDate);

      if (isNaN(regCloseDate.getTime())) {
        errors.registrationCloseDate = 'Invalid date format';
      } else if (regCloseDate > startDate) {
        errors.registrationCloseDate = 'Registration must close before or at event start time';
      } else if (regCloseDate < now) {
        errors.registrationCloseDate = 'Registration close date cannot be in the past';
      }
    }

    setDateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Show loading state during authentication check
  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-full py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  // If not authorized, don't render the form at all (we're redirecting)
  if (session?.user?.role !== 'admin' && session?.user?.role !== 'organizer') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative mb-6">
        <strong className="font-medium">Access Denied!</strong>
        <span className="block sm:inline"> You don&apos;t have permission to create events.</span>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submission initiated");

    if (!eventData.name || !eventData.startDate) {
      alert('Event name and start date are required');
      return;
    }

    // Validate dates
    if (!validateDates()) {
      alert('Please fix the date validation errors before submitting');
      return;
    }

    if (formFields.length === 0) {
      alert('Please add at least one form field for registration');
      return;
    }

    // Prevent submission if duplicate field names exist
    if (hasDuplicateFieldNames) {
      alert(`Duplicate field names detected: ${duplicateFieldNames.join(', ')}. Please make field names unique before creating the event.`);
      return;
    }

    setIsSubmitting(true);
    console.log("Submitting event:", { ...eventData, formFields });

    try {
      // Format the dates properly for API
      const formattedStartDate = new Date(eventData.startDate).toISOString();
      const formattedEndDate = eventData.endDate ? new Date(eventData.endDate).toISOString() : formattedStartDate;
      const formattedRegistrationCloseDate = eventData.registrationCloseDate
        ? new Date(eventData.registrationCloseDate).toISOString()
        : formattedStartDate; // Default to event start date if not specified

      const eventPayload = {
        name: eventData.name,
        description: eventData.description,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        registrationCloseDate: formattedRegistrationCloseDate,
        location: eventData.location,
        imageUrl: eventData.imageUrl || undefined,
        checkpoints: eventData.checkpoints,
        formFields: formFields,
      };

      // Create new event
      const response = await fetch('/api/events/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to create event');
      }

      const data = await response.json();

      if (!data.event || !data.event.id) {
        console.error('Invalid response:', data);
        throw new Error('Invalid server response');
      }

      // Log successful event creation
      console.log('Event created successfully:', data.event);

      // Redirect to the event details page
      router.push(`/dashboard/events/${data.event.id}`);
      router.refresh();

      // Show success message
      alert('Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      alert(`Failed to create event: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 data-tour="create-event-form" className="text-2xl font-bold mb-6">Create New Event</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Event Details</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Event Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={eventData.name}
                onChange={handleEventDataChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                value={eventData.description}
                onChange={handleEventDataChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Event Start Date & Time *
                </label>
                <input
                  type="datetime-local"
                  id="startDate"
                  name="startDate"
                  required
                  value={eventData.startDate}
                  onChange={handleEventDataChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${dateErrors.startDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {dateErrors.startDate && (
                  <p className="mt-1 text-sm text-red-600">{dateErrors.startDate}</p>
                )}
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Event End Date & Time
                </label>
                <input
                  type="datetime-local"
                  id="endDate"
                  name="endDate"
                  value={eventData.endDate}
                  onChange={handleEventDataChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${dateErrors.endDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {dateErrors.endDate && (
                  <p className="mt-1 text-sm text-red-600">{dateErrors.endDate}</p>
                )}
              </div>
            </div>

            {/* Duration Display */}
            {calculateDuration() !== null && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-indigo-900 font-medium">
                    Event Duration: {calculateDuration()} hours
                  </span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="registrationCloseDate" className="block text-sm font-medium text-gray-700 mb-1">
                Registration Close Date & Time
              </label>
              <div className="space-y-1">
                <input
                  type="datetime-local"
                  id="registrationCloseDate"
                  name="registrationCloseDate"
                  value={eventData.registrationCloseDate}
                  onChange={handleEventDataChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${dateErrors.registrationCloseDate ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {dateErrors.registrationCloseDate ? (
                  <p className="text-sm text-red-600">{dateErrors.registrationCloseDate}</p>
                ) : (
                  <p className="text-xs text-gray-500">Defaults to event start time if not set</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={eventData.location}
                onChange={handleEventDataChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Event location or virtual link"
              />
            </div>

            <div>
              <label htmlFor="imageUrl" className="block text-sm font-medium text-gray-700 mb-1">
                Banner Image URL (Optional)
              </label>
              <input
                type="url"
                id="imageUrl"
                name="imageUrl"
                value={eventData.imageUrl}
                onChange={handleEventDataChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://example.com/event-banner.jpg"
              />
              <p className="mt-1 text-xs text-gray-500">
                Add a banner image URL to display at the top of the registration page
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check-in Points
              </label>
              <div className="p-4 border border-gray-200 rounded-md bg-gray-50">
                <p className="text-sm text-gray-600 mb-3">
                  Add check-in points for your event (e.g., Checkin, Breakfast, Lunch, Workshop, etc.)
                </p>

                <div className="space-y-2">
                  {eventData.checkpoints.map((checkpoint, index) => (
                    <div key={index} className="flex items-center">
                      <input
                        type="text"
                        value={checkpoint}
                        onChange={(e) => {
                          // Only allow changing checkpoints other than "Checkin"
                          if (checkpoint.toLowerCase() !== "checkin") {
                            const updatedCheckpoints = [...eventData.checkpoints];
                            updatedCheckpoints[index] = e.target.value;
                            setEventData({ ...eventData, checkpoints: updatedCheckpoints });
                          }
                        }}
                        className={`flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 
                          ${checkpoint.toLowerCase() === "checkin" ? "bg-gray-100" : ""}`}
                        disabled={checkpoint.toLowerCase() === "checkin"}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          // Don't allow removing "Checkin" checkpoint
                          if (checkpoint.toLowerCase() !== "checkin") {
                            const updatedCheckpoints = eventData.checkpoints.filter((_, i) => i !== index);
                            setEventData({ ...eventData, checkpoints: updatedCheckpoints });
                          }
                        }}
                        className={`ml-2 p-2 ${checkpoint.toLowerCase() === "checkin" ?
                          "text-gray-400 cursor-not-allowed" : "text-red-500 hover:text-red-700"}`}
                        disabled={checkpoint.toLowerCase() === "checkin"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {checkpoint.toLowerCase() === "checkin" && (
                        <span className="ml-2 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">Required</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex mt-3">
                  <input
                    type="text"
                    value={newCheckpoint}
                    onChange={(e) => setNewCheckpoint(e.target.value)}
                    placeholder="New checkpoint name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newCheckpoint.trim()) {
                        setEventData({
                          ...eventData,
                          checkpoints: [...eventData.checkpoints, newCheckpoint.trim()]
                        });
                        setNewCheckpoint('');
                      }
                    }}
                    className="ml-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Add
                  </button>
                </div>

                <div className="mt-3">
                  <div className="flex space-x-2 flex-wrap">
                    {['Breakfast', 'Lunch', 'Dinner', 'Workshop', 'Keynote'].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          if (!eventData.checkpoints.includes(suggestion)) {
                            setEventData({
                              ...eventData,
                              checkpoints: [...eventData.checkpoints, suggestion]
                            });
                          }
                        }}
                        className="mt-2 px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-sm"
                      >
                        + {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Check-in Form</h2>
          <p className="text-sm text-gray-600 mb-6">
            Create the check-in form that participants will fill out when they check in to your event.
            Drag and drop to reorder fields.
          </p>

          <FormBuilder fields={formFields} onFieldsChange={handleFieldsChange} />
          {hasDuplicateFieldNames && (
            <div className="mt-3 p-3 border border-red-200 bg-red-50 text-red-700 rounded text-sm">
              Duplicate field names: {duplicateFieldNames.join(', ')} — please make each `Field Name` unique before creating the event.
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-t-4 border-indigo-500">
          <h2 className="text-lg font-medium mb-2">Form Preview</h2>
          <p className="text-sm text-gray-600 mb-6">
            This is how the check-in form will look to participants.
          </p>

          {formFields.length === 0 ? (
            <div className="border border-gray-200 rounded-lg p-12 bg-gray-50 text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Form Fields Yet</h3>
              <p className="text-gray-600 mb-4">
                Add form fields using the Registration Form section above to see a preview here.
              </p>
              <p className="text-sm text-gray-500">
                Try adding suggested fields like Name, Email, or Phone Number to get started.
              </p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              {/* Banner Image Preview */}
              {eventData.imageUrl && (
                <div className="w-full">
                  <img
                    src={eventData.imageUrl}
                    alt={`${eventData.name} banner`}
                    className="w-full h-48 object-cover"
                    onError={(e) => {
                      // Hide image if URL is invalid
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="p-6">
                <h3 className="text-xl font-semibold mb-6">{eventData.name || "Event"} Checkin</h3>

                <div className="space-y-4">
                  {/* preview form state + validation */}
                  {formFields.map(field => (
                    <div key={field.id} className="space-y-2">
                      <div className="flex justify-between">
                        <label className="block font-medium text-gray-800">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>

                        {field.useUserProfile && (
                          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                            Auto-filled from profile
                          </span>
                        )}
                      </div>

                      <RenderFormField
                        field={field}
                        value={previewFormValues[field.name] ?? (field.useUserProfile ? (field.userProfileField === 'email' ? 'user@example.com' : 'User Name') : '')}
                        onChange={handlePreviewInputChange}
                        validationErrors={previewValidationErrors}
                      />

                      {/* Google Drive link public access confirmation for preview */}
                      {field.validation?.pattern && field.validation.pattern.includes('drive.google.com') && (previewFormValues[field.name] ?? '').includes('drive.google.com') && (
                        <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-3">
                          <div className="flex items-start mb-2">
                            <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-800">Verify your link is publicly accessible</p>
                              <a
                                href={previewFormValues[field.name]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 underline inline-flex items-center mt-1"
                              >
                                Open link in new tab to verify
                                <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            </div>
                          </div>
                          <label className="flex items-start cursor-pointer">
                            <input
                              type="checkbox"
                              checked={previewDrivePublicConfirmed[field.name] || false}
                              onChange={(e) => setPreviewDrivePublicConfirmed({
                                ...previewDrivePublicConfirmed,
                                [field.name]: e.target.checked
                              })}
                              required={field.required && !!previewFormValues[field.name]}
                              className="mt-0.5 mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-200 rounded"
                            />
                            <span className="text-sm text-gray-800">
                              <span className="font-medium">✓ I confirm this Google Drive file is set to <strong className="text-yellow-800">PUBLIC ACCESS</strong></span>
                              <span className="block text-xs text-gray-600 mt-1">(Right-click file → Share → General access → Anyone with the link)</span>
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Show validation error */}
                      {previewValidationErrors[field.name] && (
                        <p className="text-sm text-red-600 mt-1">{previewValidationErrors[field.name]}</p>
                      )}

                      {/* Show validation hint if pattern exists */}
                      {field.validation?.pattern && !previewValidationErrors[field.name] && (
                        <p className="text-xs text-gray-500 mt-1">{field.validation.message || 'Please match the required format'}</p>
                      )}
                    </div>
                  ))}

                  <div className="mt-8">
                    <button
                      type="button"
                      className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium"
                      disabled={!isPreviewValid()}
                    >
                      Submit Registration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import/Export buttons at bottom */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Save your form template or import a previously saved one
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportForm}
                disabled={formFields.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                title="Export form template as JSON"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export JSON
              </button>

              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportForm}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 font-medium"
            disabled={isSubmitting || formFields.length === 0 || hasDuplicateFieldNames}
          >
            {isSubmitting ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  );
}
