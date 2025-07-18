import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  Plus,
  FileText,
  Trash2,
  Edit3,
  Save,
  X,
  Tag
} from "lucide-react";
import GlassmorphismButton from "@/components/ui/glassmorphism-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { analytics } from "@/utils/analytics";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
}

const NotesHub = () => {
  const { toast } = useToast();
  
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [showNewNoteDialog, setShowNewNoteDialog] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteTags, setNewNoteTags] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("Math");
  const [isEditing, setIsEditing] = useState(false);

  // Load notes from localStorage on component mount
  useEffect(() => {
    const savedNotes = localStorage.getItem('coexist-notes');
    if (savedNotes) {
      try {
        const parsedNotes = JSON.parse(savedNotes);
        setNotes(parsedNotes);
        
        // Load default notes if none exist
        if (parsedNotes.length === 0) {
          loadDefaultNotes();
        }
      } catch (error) {
        console.error('Error parsing saved notes:', error);
        loadDefaultNotes();
      }
    } else {
      loadDefaultNotes();
    }
  }, []);

  // Save notes to localStorage whenever notes change
  useEffect(() => {
    localStorage.setItem('coexist-notes', JSON.stringify(notes));
  }, [notes]);

  const loadDefaultNotes = () => {
    const defaultNotes: Note[] = [
      {
        id: "1",
        title: "Calculus Derivatives",
        content: `<h1>Calculus Derivatives</h1>
        
<h2>Definition</h2>
<p>The derivative of a function measures the rate at which the function's value changes with respect to changes in its input. It represents the slope of the tangent line to the function's graph at any given point.</p>

<h2>Basic Formula</h2>
<p><strong>f'(x) = lim(h→0) [f(x+h) - f(x)] / h</strong></p>

<h2>Common Derivatives</h2>
<ul>
  <li><strong>d/dx(x^n) = nx^(n-1)</strong></li>
  <li><strong>d/dx(sin x) = cos x</strong></li>
  <li><strong>d/dx(cos x) = -sin x</strong></li>
  <li><strong>d/dx(e^x) = e^x</strong></li>
</ul>

<h2>Chain Rule</h2>
<p>For composite functions: <strong>d/dx[f(g(x))] = f'(g(x)) · g'(x)</strong></p>`,
        tags: ["Math", "Calculus"],
        category: "Math",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "2",
        title: "Organic Chemistry Basics",
        content: `<h1>Organic Chemistry Basics</h1>
        
<h2>Hydrocarbons</h2>
<p>Organic compounds consisting entirely of hydrogen and carbon atoms.</p>

<h3>Types:</h3>
<ul>
  <li><strong>Alkanes</strong> - Single bonds only (saturated)</li>
  <li><strong>Alkenes</strong> - One or more double bonds</li>
  <li><strong>Alkynes</strong> - One or more triple bonds</li>
</ul>

<h2>Functional Groups</h2>
<p>Specific arrangements of atoms that give organic molecules their characteristic properties.</p>`,
        tags: ["Chemistry"],
        category: "Science",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "3",
        title: "World War II Timeline",
        content: `<h1>World War II Timeline</h1>
        
<h2>Key Events</h2>
<ul>
  <li><strong>1939</strong> - Germany invades Poland, Britain and France declare war</li>
  <li><strong>1940</strong> - Battle of Britain, Blitz begins</li>
  <li><strong>1941</strong> - Pearl Harbor attack, US enters war</li>
  <li><strong>1942</strong> - Battle of Stalingrad begins</li>
  <li><strong>1944</strong> - D-Day invasion of Normandy</li>
  <li><strong>1945</strong> - Germany surrenders, atomic bombs dropped on Japan</li>
</ul>`,
        tags: ["History"],
        category: "History",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    setNotes(defaultNotes);
  };

  const categories = ["All", "Math", "Science", "History", "Literature", "Physics", "Chemistry"];
  
  const filteredNotes = notes.filter((note: Note) => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         note.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = activeCategory === "All" || note.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCreateNote = () => {
    if (!newNoteTitle.trim()) {
      toast({
        title: "Title Required",
        description: "Please enter a title for your note.",
        variant: "destructive",
      });
      return;
    }

    const newNote: Note = {
      id: Date.now().toString(),
      title: newNoteTitle,
      content: `<h1>${newNoteTitle}</h1><p>Start writing your notes here...</p>`,
      tags: newNoteTags.split(",").map(tag => tag.trim()).filter(Boolean),
      category: newNoteCategory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
    setIsEditing(true);
    setShowNewNoteDialog(false);
    setNewNoteTitle("");
    setNewNoteTags("");
    setNewNoteCategory("Math");

    // Track note creation activity
    analytics.trackNoteActivity({
      noteId: newNote.id,
      action: 'created',
      timestamp: new Date().toISOString()
    });

    toast({
      title: "Note Created",
      description: "Your new note has been created successfully.",
    });
  };

  const handleUpdateNote = (content: string) => {
    if (!selectedNote) return;

    const updatedNote = {
      ...selectedNote,
      content,
      updatedAt: new Date().toISOString(),
    };

    setNotes(prev => prev.map(note => 
      note.id === selectedNote.id ? updatedNote : note
    ));
    setSelectedNote(updatedNote);
  };

  const handleSaveNote = () => {
    setIsEditing(false);
    toast({
      title: "Note Saved",
      description: "Your note has been saved successfully.",
    });
  };

  const handleDeleteNote = (noteId: string) => {
    setNotes(prev => prev.filter(note => note.id !== noteId));
    if (selectedNote?.id === noteId) {
      setSelectedNote(null);
      setIsEditing(false);
    }
    toast({
      title: "Note Deleted",
      description: "Note has been removed from your library.",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <main className="relative z-10 pt-20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <div className="lg:w-1/3">
            <motion.div 
              className="glassmorphism rounded-xl p-6 mb-6"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Notes Hub</h2>
                <GlassmorphismButton
                  onClick={() => setShowNewNoteDialog(true)}
                  className="bg-gradient-to-r from-blue-500 to-green-500"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Note
                </GlassmorphismButton>
              </div>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search notes..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full glassmorphism rounded-lg p-3 pl-10 bg-transparent outline-none placeholder-slate-500 dark:placeholder-slate-400 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => setActiveCategory(category)}
                      className={`px-3 py-1 rounded-full text-sm transition-all duration-300 ${
                        activeCategory === category 
                          ? 'glassmorphism-button' 
                          : 'glassmorphism hover:glassmorphism-button'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
            
            {/* Notes List */}
            <div className="space-y-3">
              {filteredNotes.length === 0 ? (
                <div className="text-center text-slate-600 dark:text-slate-400 py-8">
                  No notes found. Create your first note to get started.
                </div>
              ) : (
                filteredNotes.map((note: Note, index: number) => (
                  <motion.div
                    key={note.id}
                    className={`glassmorphism rounded-lg p-4 hover:bg-slate-100/50 dark:hover:bg-white/5 transition-all cursor-pointer ${
                      selectedNote?.id === note.id ? 'border-l-4 border-blue-500' : ''
                    }`}
                    onClick={() => {
                      setSelectedNote(note);
                      setIsEditing(false);
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.5 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <h3 className="font-semibold text-slate-900 dark:text-white truncate">{note.title}</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(note.updatedAt)}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mb-2">{note.category}</p>
                        {note.tags.length > 0 && (
                          <div className="flex space-x-1 flex-wrap">
                            {note.tags.map((tag: string) => (
                              <span 
                                key={tag}
                                className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
          
          {/* Editor */}
          <div className="lg:w-2/3">
            {selectedNote ? (
              <motion.div 
                className="space-y-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                {/* Note Header */}
                <div className="glassmorphism rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-white">{selectedNote.title}</h3>
                    <p className="text-sm text-slate-400">
                      {selectedNote.category} • Last edited {formatDate(selectedNote.updatedAt)}
                    </p>
                    {selectedNote.tags.length > 0 && (
                      <div className="flex space-x-2 mt-2">
                        {selectedNote.tags.map((tag: string) => (
                          <span 
                            key={tag}
                            className="px-3 py-1 rounded-full text-sm bg-blue-500/20 text-blue-400"
                          >
                            <Tag className="w-3 h-3 inline mr-1" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    {isEditing ? (
                      <GlassmorphismButton 
                        onClick={handleSaveNote}
                        size="sm"
                        className="bg-gradient-to-r from-green-500 to-blue-500"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </GlassmorphismButton>
                    ) : (
                      <GlassmorphismButton 
                        onClick={() => setIsEditing(true)}
                        size="sm"
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit
                      </GlassmorphismButton>
                    )}
                  </div>
                </div>
                
                {/* Rich Text Editor */}
                {isEditing ? (
                  <RichTextEditor
                    content={selectedNote.content}
                    onUpdate={handleUpdateNote}
                    title={selectedNote.title}
                  />
                ) : (
                  <motion.div 
                    className="glassmorphism rounded-xl p-6 min-h-[400px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div 
                      className="prose prose-slate dark:prose-invert max-w-none text-slate-900 dark:text-white"
                      dangerouslySetInnerHTML={{ __html: selectedNote.content }}
                    />
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                {/* Welcome Section */}
                <div className="glassmorphism rounded-xl p-6 text-center">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-xl font-semibold mb-2">Welcome to Notes Hub</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">Organize your learning with smart note-taking and advanced search capabilities.</p>
                  <GlassmorphismButton onClick={() => setShowNewNoteDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Note
                  </GlassmorphismButton>
                </div>

                {/* Quick Start Templates */}
                <div className="glassmorphism rounded-xl p-6">
                  <div className="flex items-center mb-6">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mr-3">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Quick Start Templates</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Jump-start your note-taking with these professional templates</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { 
                        title: "Study Guide Template", 
                        category: "Study", 
                        icon: "📚",
                        color: "from-blue-500 to-cyan-500",
                        description: "Comprehensive study guide with key concepts and practice problems",
                        content: `<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2rem; border-radius: 12px; margin-bottom: 1.5rem;">
  <h1 style="color: white; text-align: center; margin: 0; font-size: 2rem; font-weight: bold;">Study Guide: [Subject]</h1>
  <p style="color: #e2e8f0; text-align: center; margin: 0.5rem 0 0 0; font-size: 1.1rem;">[Course Name] - [Chapter/Unit]</p>
</div>

<div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #3b82f6;">
  <h2 style="color: #1e40af; margin-top: 0;">📋 Key Concepts</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Concept 1:</strong> Definition and detailed explanation</li>
    <li><strong>Concept 2:</strong> Definition and detailed explanation</li>
    <li><strong>Concept 3:</strong> Definition and detailed explanation</li>
  </ul>
</div>

<div style="background: #f0fdf4; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #22c55e;">
  <h2 style="color: #166534; margin-top: 0;">🔢 Important Formulas</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Formula 1:</strong> [Formula] - Used for [purpose]</li>
    <li><strong>Formula 2:</strong> [Formula] - Used for [purpose]</li>
  </ul>
</div>

<div style="background: #fef3c7; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #f59e0b;">
  <h2 style="color: #92400e; margin-top: 0;">💪 Practice Problems</h2>
  <ol style="color: #334155; line-height: 1.6;">
    <li>Problem 1: [Description with step-by-step solution]</li>
    <li>Problem 2: [Description with step-by-step solution]</li>
  </ol>
</div>

<div style="background: #fce7f3; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ec4899;">
  <h2 style="color: #be185d; margin-top: 0;">❓ Review Questions</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li>Question 1: [Self-assessment question]</li>
    <li>Question 2: [Self-assessment question]</li>
  </ul>
</div>`
                      },
                      { 
                        title: "Lecture Notes", 
                        category: "Lecture", 
                        icon: "🎓",
                        color: "from-green-500 to-teal-500",
                        description: "Structured format for capturing and organizing lecture content",
                        content: `<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 2rem; border-radius: 12px; margin-bottom: 1.5rem;">
  <h1 style="color: white; text-align: center; margin: 0; font-size: 2rem; font-weight: bold;">Lecture Notes</h1>
  <p style="color: #d1fae5; text-align: center; margin: 0.5rem 0 0 0; font-size: 1.1rem;">[Date] - [Course Name]</p>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
  <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px;">
    <h3 style="color: #475569; margin-top: 0; font-size: 1rem;">📅 Date</h3>
    <p style="color: #334155; margin: 0;">[Date]</p>
  </div>
  <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px;">
    <h3 style="color: #475569; margin-top: 0; font-size: 1rem;">📚 Topic</h3>
    <p style="color: #334155; margin: 0;">[Main Topic]</p>
  </div>
</div>

<div style="background: #e0f2fe; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #0284c7;">
  <h2 style="color: #0369a1; margin-top: 0;">💡 Key Points</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li>Main point 1 with detailed explanation</li>
    <li>Main point 2 with detailed explanation</li>
    <li>Main point 3 with detailed explanation</li>
  </ul>
</div>

<div style="background: #fef7ff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #a855f7;">
  <h2 style="color: #7c3aed; margin-top: 0;">📝 Important Details</h2>
  <p style="color: #334155; line-height: 1.6;">[Detailed explanations, examples, and additional context from the lecture]</p>
</div>

<div style="background: #fff1f2; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ef4444;">
  <h2 style="color: #dc2626; margin-top: 0;">📋 Action Items</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li>Read chapter [X] by [date]</li>
    <li>Complete assignment [Y] by [date]</li>
    <li>Review [topic] for next class</li>
  </ul>
</div>`
                      },
                      { 
                        title: "Research Notes", 
                        category: "Research", 
                        icon: "🔬",
                        color: "from-purple-500 to-indigo-500",
                        description: "Systematic approach to documenting research findings",
                        content: `<div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 2rem; border-radius: 12px; margin-bottom: 1.5rem;">
  <h1 style="color: white; text-align: center; margin: 0; font-size: 2rem; font-weight: bold;">Research Notes</h1>
  <p style="color: #e0e7ff; text-align: center; margin: 0.5rem 0 0 0; font-size: 1.1rem;">[Topic] - [Date]</p>
</div>

<div style="background: #f0f9ff; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #0284c7;">
  <h2 style="color: #0369a1; margin-top: 0;">🎯 Research Question</h2>
  <p style="color: #334155; line-height: 1.6; background: white; padding: 1rem; border-radius: 4px; border: 1px solid #e2e8f0;">[Your research question or hypothesis with clear objectives]</p>
</div>

<div style="background: #f0fdf4; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #22c55e;">
  <h2 style="color: #166534; margin-top: 0;">📚 Sources</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Source 1:</strong> [Full citation with page numbers]</li>
    <li><strong>Source 2:</strong> [Full citation with page numbers]</li>
    <li><strong>Source 3:</strong> [Full citation with page numbers]</li>
  </ul>
</div>

<div style="background: #fef3c7; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #f59e0b;">
  <h2 style="color: #92400e; margin-top: 0;">🔍 Key Findings</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Finding 1:</strong> [Detailed description with supporting evidence]</li>
    <li><strong>Finding 2:</strong> [Detailed description with supporting evidence]</li>
  </ul>
</div>

<div style="background: #fce7f3; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #ec4899;">
  <h2 style="color: #be185d; margin-top: 0;">📊 Analysis</h2>
  <p style="color: #334155; line-height: 1.6;">[Your analysis and interpretation of the findings, including patterns and connections]</p>
</div>

<div style="background: #e0f2fe; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #0284c7;">
  <h2 style="color: #0369a1; margin-top: 0;">🎓 Conclusions</h2>
  <p style="color: #334155; line-height: 1.6;">[Your conclusions and implications for future research or practical applications]</p>
</div>`
                      },
                      { 
                        title: "Meeting Notes", 
                        category: "Meeting", 
                        icon: "📝",
                        color: "from-orange-500 to-red-500",
                        description: "Professional meeting documentation with action items",
                        content: `<div style="background: linear-gradient(135deg, #f97316 0%, #ef4444 100%); padding: 2rem; border-radius: 12px; margin-bottom: 1.5rem;">
  <h1 style="color: white; text-align: center; margin: 0; font-size: 2rem; font-weight: bold;">Meeting Notes</h1>
  <p style="color: #fed7aa; text-align: center; margin: 0.5rem 0 0 0; font-size: 1.1rem;">[Meeting Title] - [Date]</p>
</div>

<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
  <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px;">
    <h3 style="color: #475569; margin-top: 0; font-size: 1rem;">📅 Date & Time</h3>
    <p style="color: #334155; margin: 0;">[Date] at [Time]</p>
  </div>
  <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px;">
    <h3 style="color: #475569; margin-top: 0; font-size: 1rem;">⏱️ Duration</h3>
    <p style="color: #334155; margin: 0;">[Duration]</p>
  </div>
</div>

<div style="background: #e0f2fe; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #0284c7;">
  <h2 style="color: #0369a1; margin-top: 0;">👥 Attendees</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Attendee 1</strong> - [Role/Title]</li>
    <li><strong>Attendee 2</strong> - [Role/Title]</li>
    <li><strong>Attendee 3</strong> - [Role/Title]</li>
  </ul>
</div>

<div style="background: #fef3c7; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #f59e0b;">
  <h2 style="color: #92400e; margin-top: 0;">📋 Agenda</h2>
  <ol style="color: #334155; line-height: 1.6;">
    <li>Topic 1: [Description]</li>
    <li>Topic 2: [Description]</li>
    <li>Topic 3: [Description]</li>
  </ol>
</div>

<div style="background: #f0fdf4; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #22c55e;">
  <h2 style="color: #166534; margin-top: 0;">✅ Key Decisions</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Decision 1:</strong> [Description and rationale]</li>
    <li><strong>Decision 2:</strong> [Description and rationale]</li>
  </ul>
</div>

<div style="background: #fff1f2; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #ef4444;">
  <h2 style="color: #dc2626; margin-top: 0;">🎯 Action Items</h2>
  <ul style="color: #334155; line-height: 1.6;">
    <li><strong>Action 1:</strong> [Description] - <em>Assigned to: [Person]</em> - <strong>Due: [Date]</strong></li>
    <li><strong>Action 2:</strong> [Description] - <em>Assigned to: [Person]</em> - <strong>Due: [Date]</strong></li>
  </ul>
</div>`
                      }
                    ].map((template, index) => (
                      <motion.div
                        key={index}
                        className="group glassmorphism rounded-lg p-6 cursor-pointer hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-300 border border-white/10 hover:border-white/20"
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const newNote: Note = {
                            id: Date.now().toString(),
                            title: template.title,
                            content: template.content,
                            tags: [template.category],
                            category: template.category,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          };
                          setNotes(prev => [...prev, newNote]);
                          setSelectedNote(newNote);
                          setIsEditing(true);
                        }}
                      >
                        <div className="flex items-start space-x-4">
                          <div className={`w-12 h-12 bg-gradient-to-r ${template.color} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                            <span className="text-2xl">{template.icon}</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">{template.title}</h4>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{template.description}</p>
                            <div className="flex items-center mt-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${template.color} text-white shadow-sm`}>
                                {template.category}
                              </span>
                              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors duration-300">
                                Click to create →
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Study Tips */}
                <div className="glassmorphism rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">Effective Note-Taking Tips</h3>
                  <div className="space-y-3">
                    {[
                      {
                        tip: "Use the Cornell Note-Taking System",
                        description: "Divide your page into notes, cues, and summary sections for better organization."
                      },
                      {
                        tip: "Create Visual Connections",
                        description: "Use diagrams, charts, and mind maps to connect related concepts."
                      },
                      {
                        tip: "Review and Revise Regularly",
                        description: "Go back to your notes within 24 hours to reinforce learning and fill gaps."
                      },
                      {
                        tip: "Use Active Voice and Keywords",
                        description: "Write in your own words and highlight key terms for better retention."
                      }
                    ].map((item, index) => (
                      <motion.div
                        key={index}
                        className="flex items-start space-x-3 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                      >
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-white text-xs font-bold">{index + 1}</span>
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-blue-400 text-sm">{item.tip}</h4>
                          <p className="text-slate-600 dark:text-slate-400 text-xs mt-1">{item.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* New Note Dialog */}
        <Dialog open={showNewNoteDialog} onOpenChange={setShowNewNoteDialog}>
          <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 max-w-md">
            <DialogHeader className="pb-4 border-b border-slate-200 dark:border-slate-700">
              <DialogTitle className="text-slate-900 dark:text-white text-xl font-semibold">Create New Note</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300 font-medium">Title</Label>
                <Input
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Enter note title"
                  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300 font-medium">Category</Label>
                <div className="relative">
                  <select
                    value={newNoteCategory}
                    onChange={(e) => setNewNoteCategory(e.target.value)}
                    className="w-full p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white appearance-none cursor-pointer focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
                  >
                    {categories.slice(1).map((category) => (
                      <option key={category} value={category} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {category}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300 font-medium">Tags (comma separated)</Label>
                <Input
                  value={newNoteTags}
                  onChange={(e) => setNewNoteTags(e.target.value)}
                  placeholder="e.g., calculus, derivatives, math"
                  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={() => setShowNewNoteDialog(false)}
                  variant="outline"
                  className="flex-1 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateNote}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  Create Note
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
};

export default NotesHub;