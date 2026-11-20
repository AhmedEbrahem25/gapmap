import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../services/api";
import type { ConceptDetail, ConceptInput, SlideRef } from "../types/api";

const SUGGESTIONS_SHOWN = 6;

/** FR-09, FR-10: the instructor defines concepts and approves the slides students are sent to. */
export function ConceptsPage() {
  const { courseId = "" } = useParams();
  const course = useQuery({ queryKey: ["course", courseId], queryFn: () => api.course(courseId) });
  const concepts = useQuery({ queryKey: ["concepts", courseId], queryFn: () => api.concepts(courseId) });
  const [adding, setAdding] = useState(false);

  return (
    <div className="max-w-4xl">
      <Link to={`/courses/${courseId}`} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to course
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Concepts and slides</h1>
          <p className="text-slate-600">{course.data?.title}</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800"
          >
            New concept
          </button>
        )}
      </div>
      <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-sm text-slate-700">
        A student who is weak in a concept is sent to its approved slides. Reports change at once; re-run the
        analysis to update recovery plans that already exist.
      </p>

      {adding && (
        <div className="mt-4">
          <ConceptForm courseId={courseId} onDone={() => setAdding(false)} />
        </div>
      )}

      {concepts.isPending && <p className="mt-6 text-slate-500">Loading concepts…</p>}
      {concepts.isError && <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-700">{concepts.error.message}</p>}
      {concepts.data?.length === 0 && (
        <p className="mt-6 text-slate-600">No concepts yet. Add one for each topic your exam questions assess.</p>
      )}
      <ul className="mt-6 space-y-4">
        {concepts.data?.map((c) => (
          <ConceptCard key={c.id} courseId={courseId} concept={c} />
        ))}
      </ul>
    </div>
  );
}

function ConceptCard({ courseId, concept }: { courseId: string; concept: ConceptDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = (data: ConceptDetail) => {
    queryClient.setQueryData<ConceptDetail[]>(["concepts", courseId], (old) =>
      old?.map((c) => (c.id === data.id ? data : c)),
    );
    queryClient.invalidateQueries({ queryKey: ["suggestions", concept.id] });
    setError(null);
  };
  const remove = useMutation({
    mutationFn: () => api.deleteConcept(concept.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["concepts", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    },
    onError: (err) => setError(err.message),
  });
  const unmap = useMutation({
    mutationFn: (slideChunkId: string) => api.removeSlide(concept.id, slideChunkId),
    onSuccess: saved,
    onError: (err) => setError(err.message),
  });

  if (editing)
    return (
      <li>
        <ConceptForm courseId={courseId} initial={concept} onDone={() => setEditing(false)} />
      </li>
    );

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{concept.name}</h2>
          {concept.description && <p className="mt-1 text-sm text-slate-600">{concept.description}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {concept.question_count} exam question{concept.question_count === 1 ? "" : "s"}
            {concept.question_count < 2 && " · needs at least 2 to be judged"}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setEditing(true)} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">
            Edit
          </button>
          <button
            onClick={() => window.confirm(`Delete "${concept.name}"?`) && remove.mutate()}
            className="rounded-md px-2 py-1 text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Approved slides</h3>
      {concept.slides.length === 0 ? (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No approved slides. Students weak in this concept will be told no suitable source was found.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {concept.slides.map((s) => (
            <li key={s.slide_chunk_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-2">
              <SlideLabel slide={s} />
              <button
                onClick={() => unmap.mutate(s.slide_chunk_id)}
                disabled={unmap.isPending}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {finding ? (
        <Suggestions concept={concept} onApproved={saved} onError={setError} onClose={() => setFinding(false)} />
      ) : (
        <button
          onClick={() => setFinding(true)}
          className="mt-3 rounded-md border border-brand-600 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Find slides
        </button>
      )}
    </li>
  );
}

function Suggestions({
  concept,
  onApproved,
  onError,
  onClose,
}: {
  concept: ConceptDetail;
  onApproved: (data: ConceptDetail) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const suggestions = useQuery({
    queryKey: ["suggestions", concept.id],
    queryFn: () => api.slideSuggestions(concept.id),
  });
  const approve = useMutation({
    mutationFn: (slideChunkId: string) => api.approveSlide(concept.id, slideChunkId),
    onSuccess: onApproved,
    onError: (err) => onError(err.message),
  });

  const all = suggestions.data ?? [];
  const matching = all.filter((s) => s.score > 0);
  const shown = showAll ? all : matching.slice(0, SUGGESTIONS_SHOWN);

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {showAll ? "All lecture pages" : "Suggested slides"}
        </h3>
        <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-900">
          Close
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Suggestions match the concept's name and description against the slide text. Check each one before
        approving.
      </p>
      {suggestions.isPending && <p className="mt-2 text-sm text-slate-500">Searching the lectures…</p>}
      {suggestions.isError && <p className="mt-2 text-sm text-red-700">{suggestions.error.message}</p>}
      {suggestions.data && shown.length === 0 && (
        <p className="mt-2 text-sm text-slate-600">
          {all.length === 0 ? "Every lecture page is already approved, or no lecture is uploaded." : "No page matches."}
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {shown.map(({ slide, matched_terms }) => (
          <li key={slide.slide_chunk_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-2">
            <div className="min-w-0">
              <SlideLabel slide={slide} />
              {matched_terms.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Matches: {matched_terms.join(", ")}</p>
              )}
            </div>
            <button
              onClick={() => approve.mutate(slide.slide_chunk_id)}
              disabled={approve.isPending}
              className="shrink-0 rounded-md bg-brand-700 px-3 py-1 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
      {suggestions.data && all.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
          Show all {all.length} pages
        </button>
      )}
    </div>
  );
}

function SlideLabel({ slide }: { slide: SlideRef }) {
  return (
    <Link to={`/materials/${slide.material_id}/pages/${slide.page_number}`} className="block min-w-0 hover:underline">
      <p className="truncate text-sm font-medium text-brand-700">{slide.title ?? `Page ${slide.page_number}`}</p>
      <p className="truncate text-xs text-slate-500">
        {slide.filename} · page {slide.page_number}
      </p>
    </Link>
  );
}

function ConceptForm({
  courseId,
  initial,
  onDone,
}: {
  courseId: string;
  initial?: ConceptDetail;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const save = useMutation({
    mutationFn: (body: ConceptInput) =>
      initial ? api.updateConcept(initial.id, body) : api.createConcept(courseId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["concepts", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      if (initial) queryClient.invalidateQueries({ queryKey: ["suggestions", initial.id] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ name, description: description.trim() || null });
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-brand-600 bg-white p-5">
      <label className="block text-sm font-medium" htmlFor="concept-name">
        Name
      </label>
      <input
        id="concept-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={200}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        placeholder="Scrum Roles"
      />
      <label className="mt-3 block text-sm font-medium" htmlFor="concept-description">
        Description <span className="font-normal text-slate-500">(helps find matching slides)</span>
      </label>
      <textarea
        id="concept-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={2000}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        placeholder="The three Scrum accountabilities: Product Owner, Scrum Master and Developers."
      />
      {save.isError && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {save.error.message}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-md bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {initial ? "Save" : "Add concept"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
